import pytest


@pytest.fixture
def sample_pcm_bytes():
    """320 samples of silence at 16kHz mono 16-bit = 640 bytes"""
    return bytes(640)
