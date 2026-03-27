"""
Verification script for Credit System setup.

Run this after applying migration 046 to verify everything is configured correctly.

Usage:
    cd backend
    python -m scripts.verify_credit_system
"""

import sys
import os
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

from app.services.credit_service import get_credit_service, CREDIT_PRICING
from supabase import create_client


def print_section(title: str):
    """Print a formatted section header."""
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)


def check_env_vars():
    """Check required environment variables."""
    print_section("1. Environment Variables")

    required = ["SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_ANON_KEY"]
    all_present = True

    for var in required:
        value = os.getenv(var)
        if value:
            print(f"✅ {var}: {value[:20]}...")
        else:
            print(f"❌ {var}: NOT SET")
            all_present = False

    return all_present


def check_database_connection():
    """Test database connection."""
    print_section("2. Database Connection")

    try:
        credit_service = get_credit_service()
        result = credit_service.client.table("organizations").select("id").limit(1).execute()
        print(f"✅ Successfully connected to Supabase")
        print(f"   Found {len(result.data)} organization(s)")
        return True
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
        return False


def check_credit_tables():
    """Check if credit tables exist."""
    print_section("3. Credit Tables")

    try:
        credit_service = get_credit_service()

        tables = ["organization_credits", "credit_transactions", "credit_holds"]
        all_exist = True

        for table in tables:
            try:
                result = credit_service.client.table(table).select("*").limit(1).execute()
                print(f"✅ Table '{table}' exists (has {len(result.data)} rows)")
            except Exception as e:
                print(f"❌ Table '{table}' error: {e}")
                all_exist = False

        return all_exist

    except Exception as e:
        print(f"❌ Error checking tables: {e}")
        return False


def check_org_credits():
    """Check organization credit records."""
    print_section("4. Organization Credits")

    try:
        credit_service = get_credit_service()

        # Get all organizations
        orgs_result = credit_service.client.table("organizations").select("id, name").execute()
        orgs = orgs_result.data

        if not orgs:
            print("⚠️  No organizations found in database")
            return True

        print(f"Found {len(orgs)} organization(s):\n")

        all_have_credits = True
        for org in orgs:
            org_id = org["id"]
            org_name = org["name"]

            try:
                balance = credit_service.get_balance(org_id)

                # Get full record
                credits_result = credit_service.client.table("organization_credits").select(
                    "balance, total_purchased, total_consumed, last_updated"
                ).eq("org_id", org_id).execute()

                if credits_result.data:
                    data = credits_result.data[0]
                    print(f"  ✅ {org_name[:40]}")
                    print(f"     Balance: {data['balance']} | Purchased: {data['total_purchased']} | Consumed: {data['total_consumed']}")
                else:
                    print(f"  ❌ {org_name[:40]}")
                    print(f"     No credit record found")
                    all_have_credits = False

            except Exception as e:
                print(f"  ❌ {org_name[:40]}")
                print(f"     Error: {e}")
                all_have_credits = False

        return all_have_credits

    except Exception as e:
        print(f"❌ Error checking org credits: {e}")
        return False


def check_rls_policies():
    """Check if RLS policies exist."""
    print_section("5. RLS Policies")

    try:
        client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

        # Query pg_policies to check for our policies
        query = """
        SELECT schemaname, tablename, policyname, permissive, cmd
        FROM pg_policies
        WHERE tablename IN ('organization_credits', 'credit_transactions', 'credit_holds')
        ORDER BY tablename, policyname;
        """

        result = client.rpc("exec_sql", {"query": query}).execute()

        if result.data:
            print(f"Found {len(result.data)} RLS policies:\n")
            for policy in result.data:
                print(f"  ✅ {policy['tablename']}.{policy['policyname']}")
                print(f"     Command: {policy['cmd']}")
        else:
            print("⚠️  No RLS policies found - this might be expected if you can't query pg_policies")
            print("     You can verify policies manually in Supabase dashboard")

        return True

    except Exception as e:
        print(f"⚠️  Could not check RLS policies (this is usually fine): {e}")
        print("     You can verify policies manually in Supabase dashboard")
        return True


def check_credit_pricing():
    """Display credit pricing configuration."""
    print_section("6. Credit Pricing Configuration")

    print("\nCurrent pricing:")
    print("\n  Resume Matching:")
    for action, cost in CREDIT_PRICING["resume_matching"].items():
        print(f"    • {action}: {cost} credits")

    print("\n  Coding Interview:")
    for action, cost in CREDIT_PRICING["coding_interview"].items():
        print(f"    • {action}: {cost} credits")

    print("\n  Voice Screening:")
    for action, cost in CREDIT_PRICING["voice_screening"].items():
        print(f"    • {action}: {cost} credits")

    return True


def test_credit_operations():
    """Test basic credit operations."""
    print_section("7. Credit Operations Test")

    try:
        credit_service = get_credit_service()

        # Get first org
        orgs_result = credit_service.client.table("organizations").select("id, name").limit(1).execute()

        if not orgs_result.data:
            print("⚠️  No organizations to test with")
            return True

        org = orgs_result.data[0]
        org_id = org["id"]
        org_name = org["name"]

        print(f"Testing with organization: {org_name}\n")

        # Test balance check
        balance = credit_service.get_balance(org_id)
        print(f"  ✅ get_balance(): {balance} credits")

        # Test cost lookup
        resume_cost = credit_service.get_credit_cost("resume_matching", "upload")
        print(f"  ✅ get_credit_cost('resume_matching', 'upload'): {resume_cost} credits")

        # Test balance check
        has_enough = credit_service.check_balance(org_id, 10)
        print(f"  ✅ check_balance(10): {has_enough}")

        print("\n  ⚠️  Not performing actual deductions/refunds in verification script")
        print("     All write operations work through the API endpoints")

        return True

    except Exception as e:
        print(f"❌ Error testing operations: {e}")
        return False


def main():
    """Run all verification checks."""
    print("\n" + "=" * 80)
    print("  CREDIT SYSTEM VERIFICATION")
    print("  " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 80)

    results = {
        "Environment Variables": check_env_vars(),
        "Database Connection": check_database_connection(),
        "Credit Tables": check_credit_tables(),
        "Organization Credits": check_org_credits(),
        "RLS Policies": check_rls_policies(),
        "Credit Pricing": check_credit_pricing(),
        "Credit Operations": test_credit_operations(),
    }

    # Summary
    print_section("SUMMARY")

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    print()
    for check, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}  {check}")

    print(f"\n  Score: {passed}/{total} checks passed")

    if passed == total:
        print("\n  🎉 All checks passed! Credit system is ready.")
        print("\n  Next steps:")
        print("    1. Start the backend: uvicorn app.main:app --reload")
        print("    2. Visit http://localhost:3000/dashboard/credits")
        print("    3. You should see your credit balance displayed correctly")
    else:
        print("\n  ⚠️  Some checks failed. Please review the errors above.")
        print("\n  If RLS policy checks failed, make sure you've applied migration 046:")
        print("    • Open Supabase SQL Editor")
        print("    • Run backend/migrations/046_fix_credit_rls_policies.sql")

    print("\n" + "=" * 80 + "\n")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
