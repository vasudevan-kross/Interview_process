import struct
from app.services.audio_processing_service import build_wav_header


def test_wav_header_length():
    pcm = bytes(640)
    header = build_wav_header(pcm)
    assert len(header) == 44


def test_wav_header_riff_chunk(sample_pcm_bytes):
    header = build_wav_header(sample_pcm_bytes)
    assert header[0:4] == b"RIFF"
    assert header[8:12] == b"WAVE"


def test_wav_header_fmt_chunk(sample_pcm_bytes):
    header = build_wav_header(sample_pcm_bytes)
    assert header[12:16] == b"fmt "
    audio_format, channels, sample_rate, _, _, bits = struct.unpack_from(
        "<HHIIHH", header, 20
    )
    assert audio_format == 1  # PCM
    assert channels == 1
    assert sample_rate == 16000
    assert bits == 16


def test_wav_header_data_size(sample_pcm_bytes):
    header = build_wav_header(sample_pcm_bytes)
    data_size = struct.unpack_from("<I", header, 40)[0]
    assert data_size == len(sample_pcm_bytes)


def test_wav_header_with_audio_is_decodable(sample_pcm_bytes):
    """Combined header + PCM should start with valid RIFF magic"""
    header = build_wav_header(sample_pcm_bytes)
    wav_bytes = header + sample_pcm_bytes
    assert wav_bytes[:4] == b"RIFF"
    assert len(wav_bytes) == 44 + len(sample_pcm_bytes)
