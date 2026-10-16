"""Reproduce the V3 birthday-order teaching experiment.

All keys and the nonce are deliberately fixed, public teaching inputs. They
must never be reused for production communication. This demonstrates selected
primitives, not a complete TLS handshake or certificate-chain implementation.
"""
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


def public_seed(label):
    return hashlib.sha256(("rainbow-crypto-v3-PUBLIC-TEACHING-ONLY:" + label).encode()).digest()


def derive(secret, direction):
    return HKDF(algorithm=hashes.SHA256(), length=32,
                salt=public_seed("public-salt"),
                info=("birthday-order-demo-v3/" + direction).encode()).derive(secret)


def public_hex(key):
    return key.public_key().public_bytes(serialization.Encoding.Raw,
                                         serialization.PublicFormat.Raw).hex()


def main():
    phone = x25519.X25519PrivateKey.from_private_bytes(public_seed("phone-private"))
    shop = x25519.X25519PrivateKey.from_private_bytes(public_seed("shop-private"))
    phone_shared = phone.exchange(shop.public_key())
    shop_shared = shop.exchange(phone.public_key())
    assert phone_shared == shop_shared
    phone_tx = derive(phone_shared, "phone-to-shop")
    shop_rx = derive(shop_shared, "phone-to-shop")
    shop_tx = derive(shop_shared, "shop-to-phone")
    assert phone_tx == shop_rx
    assert phone_tx != shop_tx
    plaintext = "送到幸福路八号，别按门铃，我下来拿。".encode("utf-8")
    nonce = public_seed("one-fixed-message-only-nonce")[:12]
    aad = b"birthday-order-v3;direction=phone-to-shop;sequence=0"
    combined = AESGCM(phone_tx).encrypt(nonce, plaintext, aad)
    restored = AESGCM(shop_rx).decrypt(nonce, combined, aad)
    assert restored == plaintext
    tampered = bytearray(combined)
    tampered[0] ^= 1
    result = None
    rejection = None
    try:
        result = AESGCM(shop_rx).decrypt(nonce, bytes(tampered), aad)
    except InvalidTag as error:
        rejection = type(error).__name__
    assert rejection == "InvalidTag"
    assert result is None
    evidence = {
        "kind": "computed-local-mechanism-demo",
        "demonstrationTitle": "生日蛋糕订单：公开协商、加密读回、单比特篡改拒收",
        "implementations": {
            "pythonPackage": "cryptography", "version": cryptography.__version__,
            "keyAgreement": "X25519", "derivation": "HKDF-SHA256",
            "authenticatedEncryption": "AES-256-GCM"
        },
        "plaintext": plaintext.decode(), "plaintextUtf8Hex": plaintext.hex(),
        "publicKeys": {"phone": public_hex(phone), "shop": public_hex(shop)},
        "sharedSecretSha256": {
            "phone": hashlib.sha256(phone_shared).hexdigest(),
            "shop": hashlib.sha256(shop_shared).hexdigest()
        },
        "directionalKeySha256": {
            "phoneToShopAtPhone": hashlib.sha256(phone_tx).hexdigest(),
            "phoneToShopAtShop": hashlib.sha256(shop_rx).hexdigest(),
            "shopToPhone": hashlib.sha256(shop_tx).hexdigest()
        },
        "ciphertextAndTagHex": combined.hex(),
        "ciphertextOnlyHex": combined[:-16].hex(), "tagHex": combined[-16:].hex(),
        "ciphertextBytes": len(combined), "payloadBytes": len(combined)-16, "tagBytes": 16,
        "nonceHex": nonce.hex(), "aad": aad.decode(), "decrypted": restored.decode(),
        "modifiedByte": 0, "bitFlipped": 0,
        "originalByteHex": f"{combined[0]:02X}", "modifiedByteHex": f"{tampered[0]:02X}",
        "tamperedCiphertextAndTagHex": bytes(tampered).hex(),
        "tamperResult": rejection, "plaintextReturnedOnTamper": result,
        "display": {
            "shortCiphertext": " ".join(f"{x:02X}" for x in combined[:8]),
            "shortTag": " ".join(f"{x:02X}" for x in combined[-16:-12]),
            "success": "订单恢复成功", "failure": "校验失败 · 拒收",
            "classification": "真实程序结果 · 固定教学输入"
        },
        "checks": {
            "sameSharedSecret": phone_shared == shop_shared,
            "sameDerivedKey": phone_tx == shop_rx,
            "differentDirectionalKeys": phone_tx != shop_tx,
            "roundTrip": restored == plaintext,
            "tamperRejected": rejection == "InvalidTag", "noPlaintextOnFailure": result is None
        },
        "limitations": [
            "Fixed public teaching seeds and a fixed one-message nonce: never use in production.",
            "Demonstrates primitives, not complete TLS 1.3, its transcript-bound key schedule, record framing, or certificates.",
            "Authentication tag failure is tested for this specific single-bit modification; no claim that paint mixing supplies security.",
            "The phone-to-shop and shop-to-phone keys differ; only the outgoing order is encrypted in this experiment."
        ]
    }
    output = ROOT / "order-crypto-evidence.json"
    output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    hashes_out = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in [Path(__file__).resolve(), output]}
    (ROOT / "order-crypto-sha256.json").write_text(json.dumps(hashes_out, indent=2)+"\n", encoding="utf-8")
    print("PASS: X25519 shared secret; directional HKDF; AES-GCM exact roundtrip; one-bit modification rejected; no plaintext returned.")
    print(f"Ciphertext byte 0: {evidence['originalByteHex']} -> {evidence['modifiedByteHex']}")


if __name__ == "__main__":
    main()
