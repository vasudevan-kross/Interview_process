import concurrent.futures
import requests
import time
import json
import logging
import statistics

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

BASE_URL = "https://misdictated-claudine-nontangentially.ngrok-free.dev/api/v1"
TOKEN = "9a54f6b5-0391-4457-acbf-27db379690f7"

def simulate_candidate(candidate_id):
    metrics = {
        "candidate_id": candidate_id,
        "join_time": 0,
        "start_time": 0,
        "save_code_times": [],
        "submit_time": 0,
        "total_time": 0
    }
    candidate_start = time.time()
    
    try:
        # 1. Join Interview
        t0 = time.time()
        response = requests.get(f"{BASE_URL}/coding-interviews/join/{TOKEN}", headers={'ngrok-skip-browser-warning': 'true'})
        response.raise_for_status()
        metrics["join_time"] = time.time() - t0
        
        interview = response.json()
        interview_id = interview["id"]
        questions = interview.get("questions", [])
        prog_lang = interview.get("programming_language", "python")
        
        # 2. Start Submission
        start_payload = {
            "candidate_name": f"Simulated Candidate {candidate_id}",
            "candidate_email": f"simulated_batch4_{candidate_id}@example.com",
            "candidate_phone": "1234567890",
            "preferred_language": prog_lang
        }
        t0 = time.time()
        start_resp = requests.post(f"{BASE_URL}/coding-interviews/start?interview_id={interview_id}", json=start_payload, headers={'ngrok-skip-browser-warning': 'true'})
        start_resp.raise_for_status()
        metrics["start_time"] = time.time() - t0
        
        start_data = start_resp.json()
        submission_id = start_data["submission_id"]
        
        # 3. Save Code
        for i, q in enumerate(questions):
            code_payload = {
                "submission_id": submission_id,
                "question_id": q.get("id", str(i)),
                "code": q.get("starter_code", "") + f"\n# Simulated code for question {i} by {candidate_id}\nprint('Hello World {candidate_id}')",
                "programming_language": prog_lang
            }
            t0 = time.time()
            save_resp = requests.post(f"{BASE_URL}/coding-interviews/save-code", json=code_payload, headers={'ngrok-skip-browser-warning': 'true'})
            save_resp.raise_for_status()
            metrics["save_code_times"].append(time.time() - t0)
            time.sleep(0.5) # simulate typing/delay
            
        # 4. Submit
        submit_payload = {
            "submission_id": submission_id,
            "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            "terms_accepted": True
        }
        t0 = time.time()
        submit_resp = requests.post(f"{BASE_URL}/coding-interviews/submit", json=submit_payload, headers={'ngrok-skip-browser-warning': 'true'})
        submit_resp.raise_for_status()
        metrics["submit_time"] = time.time() - t0
        
        metrics["total_time"] = time.time() - candidate_start
        return {"id": candidate_id, "status": "success", "metrics": metrics}
    except requests.exceptions.RequestException as e:
        error_resp = e.response.text if e.response else str(e)
        logging.error(f"Candidate {candidate_id}: Error - {e} - Response: {error_resp}")
        return {"id": candidate_id, "status": "failed", "error": error_resp}
    except Exception as e:
        logging.error(f"Candidate {candidate_id}: Error - {e}")
        return {"id": candidate_id, "status": "failed", "error": str(e)}

if __name__ == "__main__":
    NUM_CANDIDATES = 10
    logging.info(f"Starting performance testing for {NUM_CANDIDATES} concurrent candidates...")
    start_time = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=NUM_CANDIDATES) as executor:
        futures = [executor.submit(simulate_candidate, i) for i in range(1, NUM_CANDIDATES + 1)]
        results = [future.result() for future in concurrent.futures.as_completed(futures)]
        
    end_time = time.time()
    
    success_results = [r for r in results if r["status"] == "success"]
    failed = len(results) - len(success_results)
    
    logging.info(f"Test completed in {end_time - start_time:.2f} seconds. Success: {len(success_results)}, Failed: {failed}")
    
    if success_results:
        metrics = [r["metrics"] for r in success_results]
        
        join_times = [m["join_time"] for m in metrics]
        start_times = [m["start_time"] for m in metrics]
        all_save_times = [t for m in metrics for t in m["save_code_times"]]
        submit_times = [m["submit_time"] for m in metrics]
        total_times = [m["total_time"] for m in metrics]
        
        print("\n=== Performance Report (seconds) ===")
        print(f"{'Endpoint':<20} | {'Avg':<8} | {'Min':<8} | {'Max':<8}")
        print("-" * 50)
        print(f"{'Join':<20} | {statistics.mean(join_times):.3f}   | {min(join_times):.3f}   | {max(join_times):.3f}")
        print(f"{'Start':<20} | {statistics.mean(start_times):.3f}   | {min(start_times):.3f}   | {max(start_times):.3f}")
        print(f"{'Save Code (per q)':<20} | {statistics.mean(all_save_times):.3f}   | {min(all_save_times):.3f}   | {max(all_save_times):.3f}")
        print(f"{'Submit':<20} | {statistics.mean(submit_times):.3f}   | {min(submit_times):.3f}   | {max(submit_times):.3f}")
        print(f"{'Total per Candidate':<20} | {statistics.mean(total_times):.3f}   | {min(total_times):.3f}   | {max(total_times):.3f}")
        print("====================================")
    
    with open("simulate_results.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    NUM_CANDIDATES = 10
    logging.info(f"Starting simulation for {NUM_CANDIDATES} candidates...")
    start_time = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=NUM_CANDIDATES) as executor:
        futures = [executor.submit(simulate_candidate, i) for i in range(1, NUM_CANDIDATES + 1)]
        results = [future.result() for future in concurrent.futures.as_completed(futures)]
        
    end_time = time.time()
    success = sum(1 for r in results if r["status"] == "success")
    failed = sum(1 for r in results if r["status"] == "failed")
    logging.info(f"Simulation completed in {end_time - start_time:.2f} seconds. Success: {success}, Failed: {failed}")
    with open("simulate_results.json", "w") as f:
        json.dump(results, f, indent=2)
