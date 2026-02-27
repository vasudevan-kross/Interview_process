# Documentation

Welcome to the AI-Driven Interview Platform documentation!

## 📚 Table of Contents

### 🚀 Setup Guides

Get started with installation and configuration:

- **[Complete Setup Guide](setup/COMPLETE_SETUP.md)** - Full installation and configuration
- **[Role Setup](setup/role-setup.md)** - Configure user roles and permissions

### 🎯 Features

Learn about each feature:

- **[Video Interviews](features/video-interviews.md)** - Live panel interviews with Daily.co
- **[Daily.co Integration](features/daily-co-integration.md)** - Complete Daily.co setup and features

### 📖 Guides

Step-by-step how-to guides:

- **[Daily.co Migration Guide](guides/daily-co-migration.md)** - Migrate from 100ms to Daily.co

### 🔧 Troubleshooting

Fix common issues:

- **[JSON Parsing Fix](troubleshooting/json-parsing-fix.md)** - Resolve test evaluation JSON parsing errors
- **[Supabase Lock Timeout](troubleshooting/supabase-lock-timeout.md)** - Fix LockManager timeout errors
- **[Identical Scores Fix](troubleshooting/identical-scores-fix.md)** - Fix batch processing identical scores issue
- **[Empty Answers Scoring](troubleshooting/empty-answers-scoring.md)** - Prevent marks for empty/gibberish answers

---

## Quick Links

### Setup
- [Backend Configuration](setup/COMPLETE_SETUP.md#backend-setup)
- [Frontend Configuration](setup/COMPLETE_SETUP.md#frontend-setup)
- [Database Setup](setup/COMPLETE_SETUP.md#database-setup)
- [Environment Variables](setup/COMPLETE_SETUP.md#environment-variables)

### Features
- [Schedule Interview](features/video-interviews.md#scheduling)
- [Join Live Session](features/video-interviews.md#live-session)
- [View Recordings](features/video-interviews.md#recording)
- [Batch Test Evaluation](features/batch-test-evaluation.md) - Process 20+ papers efficiently

### Troubleshooting
- [JSON Parsing Errors](troubleshooting/json-parsing-fix.md) - Test evaluation parsing issues
- [Supabase Lock Timeout](troubleshooting/supabase-lock-timeout.md) - LockManager timeout errors
- [Identical Scores Issue](troubleshooting/identical-scores-fix.md) - Batch processing score problems
- [Empty Answers Scoring](troubleshooting/empty-answers-scoring.md) - Empty/gibberish getting marks
- [Video Interview Issues](features/video-interviews.md#troubleshooting)
- [Setup Problems](setup/COMPLETE_SETUP.md#troubleshooting)

---

## Getting Help

- **Issues:** Check the troubleshooting sections in each guide
- **Questions:** Review the feature documentation
- **Bugs:** Report on GitHub Issues

---

## Documentation Structure

```
docs/
├── README.md                        # This file
├── setup/                           # Installation & configuration
│   ├── COMPLETE_SETUP.md           # Full setup guide
│   └── role-setup.md               # Role configuration
├── features/                        # Feature documentation
│   ├── video-interviews.md         # Video interview guide
│   ├── daily-co-integration.md     # Daily.co complete docs
│   └── batch-test-evaluation.md    # Batch processing guide
├── guides/                          # How-to guides
│   └── daily-co-migration.md       # Migration guide
└── troubleshooting/                 # Problem resolution
    ├── json-parsing-fix.md         # JSON parsing errors
    ├── supabase-lock-timeout.md    # Supabase lock timeout
    └── identical-scores-fix.md     # Identical scores issue
```

---

## Contributing to Docs

1. Documentation uses Markdown format
2. Follow existing structure
3. Include code examples
4. Add troubleshooting sections
5. Keep language clear and concise

---

## Recent Updates

- ✅ **JSON Parsing Fix** - Robust multi-strategy JSON extraction for test evaluation
- ✅ **Batch Test Evaluation** - Process 20-50 papers simultaneously (80% faster!)
- ✅ **Daily.co Integration** - Migrated from 100ms (no credit card required!)
- ✅ **Documentation Reorganization** - Cleaned up and organized all docs
- ✅ **Video Interviews** - Complete live interview platform

---

**Need help?** Start with the [Complete Setup Guide](setup/COMPLETE_SETUP.md)!
