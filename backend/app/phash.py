"""Perceptual Image Hashing (pHash) Module for Pothole Reporter.

Generates 64-bit Discrete Cosine Transform (DCT) perceptual image hashes
to assess visual similarity between road defect photographs.

Limitations of Perceptual Hashing (pHash):
- Robustness: Highly resistant to JPEG compression, minor aspect-ratio scaling,
  slight brightness/contrast adjustments, and small watermarks.
- Vulnerability to Viewpoint: Moderate to significant camera angle shifts (>15°),
  drone vs ground perspectives, or completely different framing will alter DCT
  coefficients and increase Hamming distance.
- Lighting Variation: Extreme differences between bright daylight, overcast,
  or nighttime smartphone flash may yield lower similarity scores even for the same defect.
- Role in Architecture: pHash provides a strong heuristic filter when combined with
  spatial proximity (Haversine <= 50m). It is never used in isolation to automatically
  merge reports without human verification.
"""

from io import BytesIO
import logging
from typing import Optional, Union
import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger("pothole_reporter.phash")

# In-memory LRU cache for computed image hashes (key: image identifier/path/bytes_hash -> hex string)
_PHASH_CACHE: dict[str, str] = {}
_MAX_CACHE_SIZE = 5000


def compute_phash_from_image(image: Image.Image) -> str:
    """Compute a 64-bit perceptual hash (16-character hex string) from a PIL Image.

    Algorithm (DCT pHash):
    1. Convert image to grayscale.
    2. Resize to 32x32 pixels using anti-aliasing / area interpolation.
    3. Compute 2D Discrete Cosine Transform (DCT).
    4. Extract low-frequency 8x8 submatrix (top-left 64 coefficients).
    5. Exclude the DC component [0, 0] to calculate median frequency energy.
    6. Generate 64 bits: bit_i = 1 if coef_i > median else 0.
    7. Format as 16-character hexadecimal string.

    Args:
        image: PIL Image instance.

    Returns:
        16-character lowercase hexadecimal string representing 64-bit hash.
    """
    # 1. Grayscale conversion
    gray = image.convert("L")

    # 2. Resize to 32x32
    resized = gray.resize((32, 32), Image.Resampling.LANCZOS)
    arr = np.array(resized, dtype=np.float32)

    # 3. 2D DCT
    dct = cv2.dct(arr)

    # 4. Extract top-left 8x8 coefficients
    dct_8x8 = dct[:8, :8]

    # 5. Median calculation (excluding DC component at [0, 0])
    # The DC component represents average pixel intensity and can dominate
    low_freq = dct_8x8.flatten()
    median_val = float(np.median(low_freq[1:]))

    # 6. Generate 64-bit mask
    bits = (low_freq > median_val).astype(int)

    # 7. Pack bits into integer and format as 16-char hex
    hash_int = 0
    for bit in bits:
        hash_int = (hash_int << 1) | int(bit)

    return f"{hash_int:016x}"


def compute_phash(
    image_input: Union[Image.Image, bytes, BytesIO],
    cache_key: Optional[str] = None,
) -> str:
    """Compute perceptual hash from PIL Image, raw bytes, or BytesIO buffer.

    Args:
        image_input: Image in PIL format, byte string, or BytesIO stream.
        cache_key: Optional cache key (e.g. storage path) to avoid recomputation.

    Returns:
        16-character hexadecimal pHash.

    Raises:
        ValueError: If image data is empty, corrupted, or unsupported.
    """
    if cache_key and cache_key in _PHASH_CACHE:
        return _PHASH_CACHE[cache_key]

    pil_img: Image.Image
    try:
        if isinstance(image_input, Image.Image):
            pil_img = image_input
        elif isinstance(image_input, bytes):
            if not image_input:
                raise ValueError("Image byte buffer is empty.")
            pil_img = Image.open(BytesIO(image_input))
        elif isinstance(image_input, BytesIO):
            pil_img = Image.open(image_input)
        else:
            raise ValueError(f"Unsupported image input type: {type(image_input).__name__}")

        # Verify integrity
        pil_img.verify()
        # Re-open after verify (Pillow requirement)
        if isinstance(image_input, bytes):
            pil_img = Image.open(BytesIO(image_input))
        elif isinstance(image_input, BytesIO):
            image_input.seek(0)
            pil_img = Image.open(image_input)

    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError(f"Malformed or unreadable image for pHash generation: {exc}") from exc

    phash_hex = compute_phash_from_image(pil_img)

    if cache_key:
        if len(_PHASH_CACHE) >= _MAX_CACHE_SIZE:
            # Evict first 500 items
            keys_to_remove = list(_PHASH_CACHE.keys())[:500]
            for k in keys_to_remove:
                _PHASH_CACHE.pop(k, None)
        _PHASH_CACHE[cache_key] = phash_hex

    return phash_hex


def hamming_distance(hash1: str, hash2: str) -> int:
    """Calculate the Hamming distance (differing bit count) between two 64-bit hex hashes.

    Args:
        hash1: 16-character hex string.
        hash2: 16-character hex string.

    Returns:
        Integer between 0 (identical) and 64 (completely inverted).

    Raises:
        ValueError: If either hash is not a valid 16-character hex string.
    """
    if not isinstance(hash1, str) or not isinstance(hash2, str):
        raise ValueError("Hashes must be string values.")

    hash1_clean = hash1.strip().lower()
    hash2_clean = hash2.strip().lower()

    if len(hash1_clean) != 16 or len(hash2_clean) != 16:
        raise ValueError(
            f"Invalid pHash length: expected 16 characters, received '{hash1}' ({len(hash1_clean)}), "
            f"'{hash2}' ({len(hash2_clean)})."
        )

    try:
        val1 = int(hash1_clean, 16)
        val2 = int(hash2_clean, 16)
    except ValueError as exc:
        raise ValueError(f"Malformed hexadecimal hash: {exc}") from exc

    xor_val = val1 ^ val2
    return xor_val.bit_count()


def similarity_percentage(distance: int, total_bits: int = 64) -> float:
    """Convert Hamming distance into an understandable similarity percentage (0.0 to 100.0%).

    Args:
        distance: Hamming distance (differing bits).
        total_bits: Total bits in hash (default 64).

    Returns:
        Percentage float between 0.0 and 100.0, rounded to 2 decimal places.
    """
    clamped_dist = max(0, min(distance, total_bits))
    ratio = (total_bits - clamped_dist) / float(total_bits)
    return round(ratio * 100.0, 2)


def clear_phash_cache() -> None:
    """Purge in-memory hash cache."""
    global _PHASH_CACHE
    _PHASH_CACHE.clear()
