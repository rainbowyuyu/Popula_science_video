# V16 completed-delivery checks

Status: PASS

Video SHA256: `02d0c721eca1d56ca5393c104519eea5066599565941bec4692385be909f4445`

1920×1080, 30 fps, 10702 metadata frames / 10702 completely decoded frames. Audio: 48000 Hz, 2 channels.

AAC input loudness: -16.15 LUFS; true peak: -1.71 dBTP.

Contact sheets: 75 groups / 724 unique frames.

Complete automatic decoding/black/silence/loudness scan, stream synchronization, sampled AAC-to-master correlation, and frame-exact contact sheets. Contact generation is not full manual watching/listening. Source hashes identify the audited current source snapshot; render-start provenance must be preserved separately.

Review notes:

- Source audit has no separate staticAssetHashes array; actual input coverage depends on sourceHashes. No old asset schema was assumed.
- Some six-frame contact samples have large image changes; inspect the listed sheets for spatial continuity.

