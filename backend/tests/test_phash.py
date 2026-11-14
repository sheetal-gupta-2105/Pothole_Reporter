"""Unit tests for Perceptual Image Hashing (pHash) Module."""

from io import BytesIO
import pytest
from PIL import Image, ImageDraw
from app.phash import (
    compute_phash,
    compute_phash_from_image,
    hamming_distance,
    similarity_percentage,
    clear_phash_cache,
)


def create_test_image(pattern: str = "checker") -> Image.Image:
    """Generate a simple reproducible synthetic image for testing."""
    img = Image.new("RGB", (200, 200), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    if pattern == "checker":
        for i in range(0, 200, 40):
            for j in range(0, 200, 40):
                if (i + j) % 80 == 0:
                    draw.rectangle([i, j, i + 40, j + 40], fill=(0, 0, 0))
    elif pattern == "circle":
        draw.ellipse([50, 50, 150, 150], fill=(50, 50, 50), outline=(0, 0, 0))
    elif pattern == "diagonal":
        draw.line([0, 0, 200, 200], fill=(0, 0, 0), width=10)

    return img


def test_phash_format_and_reproducibility():
    """pHash must return a 16-character lowercase hex string, reproducible across runs."""
    img = create_test_image("checker")
    hash1 = compute_phash_from_image(img)
    hash2 = compute_phash_from_image(img)

    assert isinstance(hash1, str)
    assert len(hash1) == 16
    assert all(c in "0123456789abcdef" for c in hash1)
    assert hash1 == hash2


def test_identical_images_zero_distance():
    """Identical images must have a Hamming distance of 0 and 100% similarity."""
    img = create_test_image("circle")
    h1 = compute_phash(img)
    h2 = compute_phash(img)

    dist = hamming_distance(h1, h2)
    assert dist == 0
    assert similarity_percentage(dist) == 100.0


def test_similar_images_low_distance():
    """Resized or re-compressed version of an image should have very low Hamming distance (<= 6)."""
    orig = create_test_image("checker")
    # Save to JPEG bytes with compression
    buf = BytesIO()
    orig.save(buf, format="JPEG", quality=75)
    compressed_bytes = buf.getvalue()

    h_orig = compute_phash(orig)
    h_comp = compute_phash(compressed_bytes)

    dist = hamming_distance(h_orig, h_comp)
    assert dist <= 6
    assert similarity_percentage(dist) >= 90.0


def test_dissimilar_images_high_distance():
    """Completely different patterns must produce high Hamming distance (> 12)."""
    img1 = create_test_image("checker")
    img2 = create_test_image("diagonal")

    h1 = compute_phash(img1)
    h2 = compute_phash(img2)

    dist = hamming_distance(h1, h2)
    assert dist >= 12
    assert similarity_percentage(dist) < 85.0


def test_compute_phash_input_formats():
    """compute_phash should handle PIL Image, raw bytes, and BytesIO identically."""
    img = create_test_image("circle")
    buf = BytesIO()
    img.save(buf, format="PNG")
    raw_bytes = buf.getvalue()

    h_pil = compute_phash(img)
    h_bytes = compute_phash(raw_bytes)
    h_stream = compute_phash(BytesIO(raw_bytes))

    assert h_pil == h_bytes == h_stream


def test_corrupted_image_handling():
    """Corrupted or invalid byte streams must raise ValueError gracefully."""
    with pytest.raises(ValueError, match="Malformed or unreadable image"):
        compute_phash(b"not an image buffer")

    with pytest.raises(ValueError, match="Image byte buffer is empty"):
        compute_phash(b"")


def test_hamming_distance_invalid_inputs():
    """Invalid hash strings must raise ValueError."""
    with pytest.raises(ValueError, match="Invalid pHash length"):
        hamming_distance("abc", "1234567890abcdef")

    with pytest.raises(ValueError, match="Malformed hexadecimal hash"):
        hamming_distance("1234567890abcdeg", "1234567890abcdef")  # 'g' is invalid hex


def test_similarity_percentage_scale():
    """Verify conversion of distance to percentage."""
    assert similarity_percentage(0) == 100.0
    assert similarity_percentage(64) == 0.0
    assert similarity_percentage(10) == 84.38
    assert similarity_percentage(16) == 75.0


def test_phash_cache():
    """Cache should store and return hashes by cache_key."""
    clear_phash_cache()
    img = create_test_image("diagonal")
    h1 = compute_phash(img, cache_key="test-key-01")
    # Calling again with same key returns cached value
    h2 = compute_phash(img, cache_key="test-key-01")
    assert h1 == h2
    clear_phash_cache()
