#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7/runtime
cd "$base/openfoam-debs"
apt-get download libpmix2 libmunge2 openmpi-common
for package in libpmix*.deb libmunge*.deb openmpi-common*.deb; do dpkg-deb -x "$package" "$base/openfoam"; done
cd ..
