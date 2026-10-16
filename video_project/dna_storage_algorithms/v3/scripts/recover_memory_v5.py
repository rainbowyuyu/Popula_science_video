"""Reproducible, deliberately small computer demonstration for the V5 film.

This is a fixed XOR chain code, NOT DNA Fountain and NOT a wet-lab experiment.
The decoder receives surviving DNA strings, known packet identities, and five
imperfect reads of one known 48-base region. It never receives the original
file or the correct region. Full-length global alignment is used for this
small consensus; Smith-Waterman is a separate local-alignment illustration.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BASES = "ACGT"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(command: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8")


def xor(a: bytes, b: bytes) -> bytes:
    if len(a) != len(b):
        raise ValueError("XOR blocks must have the same padded length")
    return bytes(x ^ y for x, y in zip(a, b))


def to_dna(data: bytes) -> str:
    return "".join(BASES[(b >> shift) & 3] for b in data for shift in (6, 4, 2, 0))


def from_dna(sequence: str) -> bytes:
    if len(sequence) % 4 or any(base not in BASES for base in sequence):
        raise ValueError("DNA byte mapping requires complete groups of four A/C/G/T bases")
    return bytes(sum(BASES.index(b) << (6 - 2 * j) for j, b in enumerate(sequence[i:i + 4]))
                 for i in range(0, len(sequence), 4))


def global_alignment(a: str, b: str) -> tuple[str, str, int]:
    """Needleman-Wunsch, known full-length toy reads; ties: diagonal, up, left."""
    h = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        h[i][0] = -2 * i
    for j in range(len(b) + 1):
        h[0][j] = -2 * j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            h[i][j] = max(h[i - 1][j - 1] + (2 if a[i - 1] == b[j - 1] else -1),
                          h[i - 1][j] - 2, h[i][j - 1] - 2)
    i, j = len(a), len(b)
    aa, bb = [], []
    while i or j:
        if i and j and h[i][j] == h[i - 1][j - 1] + (2 if a[i - 1] == b[j - 1] else -1):
            aa.append(a[i - 1]); bb.append(b[j - 1]); i -= 1; j -= 1
        elif i and h[i][j] == h[i - 1][j] - 2:
            aa.append(a[i - 1]); bb.append("-"); i -= 1
        else:
            aa.append("-"); bb.append(b[j - 1]); j -= 1
    return "".join(reversed(aa)), "".join(reversed(bb)), h[-1][-1]


def edit_distance(a: str, b: str) -> int:
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        nxt = [i]
        for j, cb in enumerate(b, 1):
            nxt.append(min(row[j] + 1, nxt[j - 1] + 1, row[j - 1] + (ca != cb)))
        row = nxt
    return row[-1]


def consensus(reads: list[str]) -> dict:
    """Observed-read medoid star alignment. Gaps participate in voting."""
    totals = [sum(edit_distance(a, b) for b in reads) for a in reads]
    backbone_index = min(range(len(reads)), key=lambda i: (totals[i], i))
    backbone = reads[backbone_index]
    rows, all_keys, alignments = [], set(), []
    for read in reads:
        aa, bb, score = global_alignment(backbone, read)
        alignments.append({"backbone": aa, "read": bb, "score": score})
        mapped, pos, insertion = {}, 0, 0
        for ca, cb in zip(aa, bb):
            if ca == "-":
                key = (pos, 0, insertion)
                insertion += 1
            else:
                key = (pos, 1, 0)
                pos += 1
                insertion = 0
            mapped[key] = cb
            all_keys.add(key)
        rows.append(mapped)
    keys = sorted(all_keys)
    grid = ["".join(row.get(key, "-") for key in keys) for row in rows]
    output, columns = [], []
    for index, key in enumerate(keys):
        votes = Counter(row.get(key, "-") for row in rows)
        winner, count = sorted(votes.items(), key=lambda pair: (-pair[1], pair[0]))[0]
        if count <= len(reads) // 2:
            winner = "N"
        if winner != "-":
            output.append(winner)
        columns.append({"column": index, "votes": dict(votes), "winner": winner,
                        "strictMajority": count > len(reads) // 2})
    return {"method": "observed-read medoid + global star alignment + strict majority including gaps",
            "backboneReadIndex": backbone_index, "medoidDistanceSums": totals,
            "inputReads": reads, "pairwiseAlignments": alignments,
            "alignedReads": grid, "columns": columns, "sequence": "".join(output)}


def smith_waterman(a: str, b: str) -> dict:
    h = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    best, end = 0, (0, 0)
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            h[i][j] = max(0, h[i - 1][j - 1] + (2 if a[i - 1] == b[j - 1] else -1),
                          h[i - 1][j] - 2, h[i][j - 1] - 2)
            if h[i][j] > best:
                best, end = h[i][j], (i, j)
    i, j = end
    aa, bb, trace = [], [], []
    while h[i][j] > 0:
        trace.append({"row": i, "column": j, "score": h[i][j]})
        if i and j and h[i][j] == h[i - 1][j - 1] + (2 if a[i - 1] == b[j - 1] else -1):
            aa.append(a[i - 1]); bb.append(b[j - 1]); i -= 1; j -= 1
        elif i and h[i][j] == h[i - 1][j] - 2:
            aa.append(a[i - 1]); bb.append("-"); i -= 1
        else:
            aa.append("-"); bb.append(b[j - 1]); j -= 1
    trace.append({"row": i, "column": j, "score": h[i][j]})
    return {"algorithm": "Smith-Waterman local alignment", "a": a, "b": b,
            "scoring": {"match": 2, "mismatch": -1, "gap": -2, "floor": 0},
            "score": best, "startCell": [i, j], "maxCell": list(end),
            "alignedA": "".join(reversed(aa)), "alignedB": "".join(reversed(bb)),
            "tracebackMaxToZero": trace, "matrix": h}


def mutate_reads(sequence: str) -> list[dict]:
    def sub(index: int) -> str:
        return sequence[:index] + BASES[(BASES.index(sequence[index]) + 1) % 4] + sequence[index + 1:]
    return [
        {"id": "r01", "kind": "substitution", "position0": 9, "sequence": sub(9)},
        {"id": "r02", "kind": "deletion", "position0": 17, "sequence": sequence[:17] + sequence[18:]},
        {"id": "r03", "kind": "insertion", "position0": 25, "sequence": sequence[:25] + "G" + sequence[25:]},
        {"id": "r04", "kind": "substitution", "position0": 34, "sequence": sub(34)},
        {"id": "r05", "kind": "substitution", "position0": 42, "sequence": sub(42)},
        {"id": "r06", "kind": "uncorrupted-but-dropped", "sequence": sequence},
    ]


def encode(original: Path, output: Path, block_bytes: int) -> dict:
    data = original.read_bytes()
    blocks = [data[i:i + block_bytes].ljust(block_bytes, b"\0") for i in range(0, len(data), block_bytes)]
    if len(blocks) < 8:
        raise ValueError("Need at least eight blocks for visible erasure groups")
    packets = [{"id": f"b{i:04d}", "kind": "original", "members": [i], "dna": to_dna(b)}
               for i, b in enumerate(blocks)]
    packets += [{"id": f"x{i - 1:04d}_{i:04d}", "kind": "xor", "members": [i - 1, i],
                 "dna": to_dna(xor(blocks[i - 1], blocks[i]))} for i in range(1, len(blocks))]
    with (output / "encoded-packets.jsonl").open("w", encoding="utf-8") as stream:
        for packet in packets:
            stream.write(json.dumps(packet) + "\n")
    metadata = {"originalLengthBytes": len(data), "blockBytes": block_bytes, "blockCount": len(blocks),
                "paddingBytes": len(blocks) * block_bytes - len(data),
                "code": "fixed adjacent XOR chain, all N-1 parity packets retained",
                "mapping": {"00": "A", "01": "C", "10": "G", "11": "T"},
                "paddedOriginalBytes": len(blocks) * block_bytes,
                "redundantPayloadBytes": (len(blocks) - 1) * block_bytes,
                "redundancyRatioOverPaddedOriginal": (len(blocks) - 1) / len(blocks),
                "packetIdentityPolicy": "packet identities/member lists, exact byte length, read grouping and edited-region location are known educational metadata; not noisy DNA headers"}
    write_json(output / "decode-metadata.json", metadata)
    return metadata


def noisy_channel(output: Path, metadata: dict) -> dict:
    packets = [json.loads(line) for line in (output / "encoded-packets.jsonl").read_text().splitlines()]
    dropped = [i for i in range(1, metadata["blockCount"]) if i % 7 in (1, 2, 4)]
    retained = [p for p in packets if p["kind"] == "xor" or p["members"][0] not in dropped]
    # Pick a diverse 48-base window in the actual anchor block. The decoder gets
    # only its known location and corrupted reads, never this original window.
    anchor = next(p for p in retained if p["id"] == "b0000")
    candidates = range(0, len(anchor["dna"]) - 47, 4)
    offset = max(candidates, key=lambda i: (len({anchor["dna"][j:j + 5] for j in range(i, i + 44)}),
                                           min(Counter(anchor["dna"][i:i + 48]).values()), -i))
    correct_region = anchor["dna"][offset:offset + 48]
    reads = mutate_reads(correct_region)
    observed = reads[:5]
    anchor["dna"] = anchor["dna"][:offset] + "N" * 48 + anchor["dna"][offset + 48:]
    patch = {"packetId": anchor["id"], "startBase0": offset, "lengthBases": 48,
             "reads": observed, "droppedReadIds": ["r06"],
             "knownBoundary": "a single known region of one actual file block; simplified read clustering and boundaries"}
    write_json(output / "observed-region-reads.json", patch)
    with (output / "received-packets.jsonl").open("w", encoding="utf-8") as stream:
        for packet in reversed(retained):  # Packet arrival order does not give file order.
            stream.write(json.dumps(packet) + "\n")
    return {"removedOriginalBlockIndices": dropped, "removedOriginalCount": len(dropped),
            "retainedOriginalCount": metadata["blockCount"] - len(dropped),
            "retainedXorPacketCount": metadata["blockCount"] - 1,
            "packetOrder": "reversed", "trueRegionForValidationOnly": correct_region,
            "regionPacketId": "b0000", "regionStartBase0": offset,
            "allReadsBeforeDropping": reads, "droppedReadIds": ["r06"]}


def decode(output: Path) -> dict:
    """Only read received data and decode metadata; no original/encoded access."""
    metadata = json.loads((output / "decode-metadata.json").read_text(encoding="utf-8"))
    packets = [json.loads(line) for line in (output / "received-packets.jsonl").read_text().splitlines()]
    patch = json.loads((output / "observed-region-reads.json").read_text())
    merged = consensus([read["sequence"] for read in patch["reads"]])
    if len(merged["sequence"]) != patch["lengthBases"] or "N" in merged["sequence"]:
        raise ValueError("The toy consensus lacks sufficient evidence")
    anchor = next(packet for packet in packets if packet["id"] == patch["packetId"])
    start = patch["startBase0"]
    anchor["dna"] = anchor["dna"][:start] + merged["sequence"] + anchor["dna"][start + patch["lengthBases"]:]
    known = {p["members"][0]: from_dna(p["dna"]) for p in packets if p["kind"] == "original"}
    parity = sorted((p for p in packets if p["kind"] == "xor"), key=lambda p: p["members"])
    trace = []
    while len(known) < metadata["blockCount"]:
        before = len(known)
        for packet in parity:
            left, right = packet["members"]
            if (left in known) == (right in known):
                continue
            source, target = (left, right) if left in known else (right, left)
            known[target] = xor(known[source], from_dna(packet["dna"]))
            trace.append({"knownBlock": source, "xorPacket": packet["id"], "recoveredBlock": target,
                          "equation": f"B{target} = B{source} XOR (B{left} XOR B{right})"})
        if len(known) == before:
            raise ValueError("Insufficient independent relations: peeling decoder stalled")
    recovered = b"".join(known[i] for i in range(metadata["blockCount"]))[:metadata["originalLengthBytes"]]
    (output / "recovered.mp4").write_bytes(recovered)
    return {"consensus": merged, "recoverySteps": trace, "recoveredBlockCount": len(trace),
            "allBlocksRecovered": len(known) == metadata["blockCount"],
            "decoderInputs": ["decode-metadata.json", "received-packets.jsonl", "observed-region-reads.json"],
            "originalFileReadByDecoder": False, "videoReencodedAfterRecovery": False}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "public/bridges/family-memory.png")
    parser.add_argument("--output", type=Path, default=ROOT / "work/memory-v5")
    parser.add_argument("--report", type=Path, default=ROOT / "research/memory-recovery-v5.json")
    parser.add_argument("--atlas", type=Path, default=ROOT / "public/bridges/memory-film-atlas.jpg")
    parser.add_argument("--block-bytes", type=int, default=1024)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    original = args.output / "original.mp4"
    # This source is a generated family-memory illustration, not historical film.
    vf = "zoompan=z='1.04':x='(iw-iw/zoom)/2+10*sin(on/89*PI)':y='(ih-ih/zoom)/2':d=90:s=1280x720:fps=30,format=yuv420p"
    create_command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(args.input),
                      "-vf", vf, "-frames:v", "90", "-an", "-c:v", "libx264", "-preset", "medium",
                      "-crf", "20", "-threads", "2", "-map_metadata", "-1", str(original)]
    run(create_command)
    metadata = encode(original, args.output, args.block_bytes)
    channel = noisy_channel(args.output, metadata)
    decoded = decode(args.output)
    recovered = args.output / "recovered.mp4"
    original_bytes, recovered_bytes = original.read_bytes(), recovered.read_bytes()
    byte_equal = original_bytes == recovered_bytes
    hash_equal = sha(original) == sha(recovered)
    region_equal = decoded["consensus"]["sequence"] == channel["trueRegionForValidationOnly"]
    if not (byte_equal and hash_equal and region_equal):
        raise AssertionError("Recovery validation failed")
    strict_decode = run(["ffmpeg", "-v", "error", "-xerror", "-i", str(recovered), "-f", "null", "-"])
    probe = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
                            "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames,duration",
                            "-of", "json", str(recovered)]).stdout)
    stream = probe["streams"][0]
    if not (stream["width"] == 1280 and stream["height"] == 720 and stream["nb_read_frames"] == "90"
            and stream["r_frame_rate"] == "30/1" and abs(float(stream["duration"]) - 3) < 0.001):
        raise AssertionError("Unexpected recovered video format")
    args.atlas.parent.mkdir(parents=True, exist_ok=True)
    atlas_command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(recovered),
                     "-vf", "fps=30,scale=384:216:flags=lanczos,tile=10x9:nb_frames=90:padding=0:margin=0",
                     "-frames:v", "1", "-q:v", "2", "-update", "1", str(args.atlas)]
    run(atlas_command)
    from PIL import Image
    with Image.open(args.atlas) as atlas_image:
        atlas_size = list(atlas_image.size)
    if atlas_size != [3840, 1944]:
        raise AssertionError("Unexpected atlas dimensions")
    # A separate textbook-sized local example makes the score table usable onscreen.
    local = smith_waterman("ACGTCAGTAC", "ACGTAGTAC")
    chinese = smith_waterman("今天我们去看海", "今天我们看海")
    artifacts = []
    for path in [args.input, Path(__file__), original, recovered, args.atlas,
                 *[args.output / name for name in ("encoded-packets.jsonl", "decode-metadata.json",
                                                   "received-packets.jsonl", "observed-region-reads.json")]]:
        artifacts.append({"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)})
    report = {
        "version": 5, "status": "PASS", "boundary": "Fixed educational linear XOR-chain code with one toy multiread consensus region. Not complete DNA Fountain; no synthesis or sequencing experiment was performed.",
        "sourceImage": str(args.input), "sourceIdentity": "existing generated family-memory illustration; not The Arrival of a Train footage",
        "encode": metadata, "channel": channel, "decode": decoded,
        "localAlignmentExample": local, "chineseAnalogyAlignment": chinese,
        "validation": {"byteForByteEqual": byte_equal, "sha256Equal": hash_equal,
                       "originalSha256": sha(original), "recoveredSha256": sha(recovered),
                       "correctedActualFileRegionEqual": region_equal,
                       "strictVideoDecodeExitCode": strict_decode.returncode, "videoProbe": stream,
                       "shaIsValidationNotErrorCorrection": True},
        "atlas": {"path": str(args.atlas), "sha256": sha(args.atlas), "width": 3840, "height": 1944,
                  "columns": 10, "rows": 9, "cellWidth": 384, "cellHeight": 216, "frames": 90,
                  "fps": 30, "durationSec": 3, "source": str(recovered),
                  "ordering": "row-major, top-left frame 0, bottom-right frame 89",
                  "threeTextureRepeat": [0.1, 1 / 9],
                  "threeTextureOffset": "[frame % 10 / 10, 1 - (floor(frame / 10) + 1) / 9] with default flipY=true"},
        "limitations": ["High redundancy: N-1 full-size parity blocks for N original blocks; no Fountain degree distribution or biochemical sequence screening.",
                        "Packet identities, original byte count, region location, read grouping and full-length endpoints are assumed known and reliable.",
                        "The five retained toy reads have independent, deliberately separated errors. Majority voting can fail for correlated errors or inadequate evidence.",
                        "The repair path uses global alignment on these known full-length toy reads; Smith-Waterman is demonstrated separately for local correspondence and is not the whole decoder.",
                        "All XOR parity packets and original block zero survive. Other erasure patterns may lack independent information and fail.",
                        "Byte equality verifies exact digital recovery. It makes no claim about real chemical DNA recovery rates."],
        "commands": {"createOriginal": create_command, "decodeAtlasFromRecovered": atlas_command},
        "artifacts": artifacts,
    }
    write_json(args.report, report)
    print(json.dumps({"status": report["status"], "originalBytes": len(original_bytes),
                      "blocks": metadata["blockCount"], "droppedBlocks": channel["removedOriginalCount"],
                      "recoveredBlocks": decoded["recoveredBlockCount"], "sha256": sha(recovered),
                      "atlas": str(args.atlas), "report": str(args.report)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
