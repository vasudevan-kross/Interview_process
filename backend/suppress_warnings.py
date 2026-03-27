"""
Suppress harmless dependency warnings.

This module suppresses the RequestsDependencyWarning that occurs due to
chardet version mismatch (paddlex requires chardet 7.2.0, but requests
expects an older version). This warning is harmless and can be safely ignored.
"""

import warnings

# Suppress RequestsDependencyWarning
warnings.filterwarnings('ignore', message='.*urllib3.*doesn\'t match a supported version.*')
warnings.filterwarnings('ignore', category=DeprecationWarning, module='requests')

# Import this at the top of main.py to suppress warnings globally
