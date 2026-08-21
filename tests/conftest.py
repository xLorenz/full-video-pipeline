import os

# pipeline.py hard-exits on non-POSIX at import; allow tests on any OS.
os.environ.setdefault("PIPELINE_FORCE_NON_POSIX", "1")
