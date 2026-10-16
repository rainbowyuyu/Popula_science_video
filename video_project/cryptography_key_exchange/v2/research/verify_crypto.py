"""Reproduce PUBLIC fixed teaching inputs. Never use these keys in production."""
import hashlib
import json
from pathlib import Path

import cryptography
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def seed(label):
    return hashlib.sha256(("rainbow-crypto-film-v2-public-demo:" + label).encode()).digest()


def derive(secret):
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=seed("public-salt"),
                info=b"rainbow-letter-mechanism-demo-v2").derive(secret)


def residues(base, count):
    return [{"step": n, "remainder": pow(base, n, 23)} for n in range(1, count + 1)]


assert pow(5, 6, 23) == 8
assert pow(5, 15, 23) == 19
assert pow(19, 6, 23) == pow(8, 15, 23) == pow(5, 90, 23) == 2
toy = {
    "kind": "fixed-teaching-example",
    "parameters": {"g": 5, "p": 23, "a": 6, "b": 15},
    "public": {"A": 8, "B": 19},
    "shared": {"alice": 2, "bob": 2},
    "steps": {"alicePublic": residues(5, 6), "bobPublic": residues(5, 15),
              "aliceShared": residues(19, 6), "bobShared": residues(8, 15)},
    "identity": {"a_times_b": 90, "g_ab_mod_p": 2},
    "checks": {"sameSecret": True, "expectedPublic": True, "expectedSecret": True,
               "smallExampleInsecure": True},
    "notice": "Tiny teaching parameters are deliberately insecure. Production DH requires standard groups, public-key validation, authentication and key derivation.",
}
save(ROOT / "toy-dh-calculation.json", toy)
save(PROJECT / "src/math-evidence.json", toy)

alice = x25519.X25519PrivateKey.from_private_bytes(seed("alice-demo-only"))
bob = x25519.X25519PrivateKey.from_private_bytes(seed("bob-demo-only"))
sa = alice.exchange(bob.public_key())
sb = bob.exchange(alice.public_key())
assert sa == sb
ka, kb = derive(sa), derive(sb)
assert ka == kb
nonce = seed("one-message-only-nonce")[:12]
plain = "今晚八点，老地方。".encode("utf-8")
aad = b"letter-demo-v2"
cipher = AESGCM(ka).encrypt(nonce, plain, aad)
restored = AESGCM(kb).decrypt(nonce, cipher, aad)
assert restored == plain
bad = bytearray(cipher)
bad[0] ^= 1
rejected = False
try:
    AESGCM(kb).decrypt(nonce, bytes(bad), aad)
except InvalidTag:
    rejected = True
assert rejected, "The modified ciphertext must be rejected"


def public_hex(key):
    return key.public_key().public_bytes(serialization.Encoding.Raw,
                                         serialization.PublicFormat.Raw).hex()


record = {
    "kind": "computed-local-mechanism-demo",
    "implementations": {"pythonPackage": "cryptography", "version": cryptography.__version__,
                        "keyAgreement": "X25519", "derivation": "HKDF-SHA256",
                        "authenticatedEncryption": "AES-256-GCM"},
    "plaintext": plain.decode("utf-8"),
    "plaintextUtf8Hex": plain.hex(),
    "publicKeys": {"alice": public_hex(alice), "bob": public_hex(bob)},
    "ciphertextAndTagHex": cipher.hex(),
    "ciphertextOnlyHex": cipher[:-16].hex(),
    "tagHex": cipher[-16:].hex(),
    "ciphertextBytes": len(cipher),
    "payloadBytes": len(cipher) - 16,
    "tagBytes": 16,
    "nonceHex": nonce.hex(),
    "aad": aad.decode(),
    "decrypted": restored.decode("utf-8"),
    "modifiedByte": 0,
    "bitFlipped": 0,
    "originalByteHex": f"{cipher[0]:02x}",
    "modifiedByteHex": f"{bad[0]:02x}",
    "tamperedCiphertextAndTagHex": bytes(bad).hex(),
    "tamperResult": "InvalidTag; no plaintext returned",
    "checks": {"sameSharedSecret": True, "sameDerivedKey": True,
               "roundTrip": True, "tamperRejected": rejected},
    "notice": "Deterministic public teaching seeds, not production keys. One fixed teaching message/nonce. Demonstrates primitives, not a full TLS implementation or certificate-chain verification.",
}
save(ROOT / "authenticated-encryption-demo.json", record)
save(PROJECT / "src/crypto-evidence.json", record)

files = [ROOT / "toy-dh-calculation.json", ROOT / "authenticated-encryption-demo.json",
         ROOT / "verify_crypto.py"]
save(ROOT / "evidence-sha256.json", {
    p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files
})
print("PASS: DH toy arithmetic; X25519 agreement; HKDF-SHA256; AES-256-GCM exact roundtrip; 1-bit tamper -> InvalidTag")
print("Plaintext:", record["plaintext"])
print("First ciphertext byte:", record["originalByteHex"], "->", record["modifiedByteHex"])
