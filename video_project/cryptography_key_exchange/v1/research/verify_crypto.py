"""Reproduce this film's fixed, PUBLIC teaching inputs; never deploy these keys."""
import hashlib
import json
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

ROOT = Path(__file__).resolve().parent


def seed(label):
    return hashlib.sha256(("rainbow-crypto-film-v1:" + label).encode()).digest()


def derive(secret):
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=seed("public-salt"),
                info=b"rainbow-film-mechanism-demo").derive(secret)


toy = json.loads((ROOT / "toy-dh-calculation.json").read_text(encoding="utf-8"))
assert pow(5, 6, 23) == toy["public"]["A"] == 8
assert pow(5, 15, 23) == toy["public"]["B"] == 19
assert pow(19, 6, 23) == pow(8, 15, 23) == pow(5, 90, 23) == 2

alice = x25519.X25519PrivateKey.from_private_bytes(seed("alice-demo-only"))
bob = x25519.X25519PrivateKey.from_private_bytes(seed("bob-demo-only"))
ka = derive(alice.exchange(bob.public_key()))
kb = derive(bob.exchange(alice.public_key()))
assert ka == kb
nonce = seed("one-message-only-nonce")[:12]
plain = "蛋糕少放糖".encode("utf-8")
aad = b"order-demo-v1"
cipher = AESGCM(ka).encrypt(nonce, plain, aad)
assert AESGCM(kb).decrypt(nonce, cipher, aad) == plain
record = json.loads((ROOT / "authenticated-encryption-demo.json").read_text(encoding="utf-8"))
assert cipher.hex() == record["ciphertextAndTagHex"]
bad = bytearray(cipher)
bad[0] ^= 1
try:
    AESGCM(kb).decrypt(nonce, bytes(bad), aad)
except InvalidTag:
    pass
else:
    raise AssertionError("Tampered data should have been rejected")
print("PASS: teaching modular arithmetic, X25519 agreement, HKDF, AES-GCM roundtrip and tamper rejection")
