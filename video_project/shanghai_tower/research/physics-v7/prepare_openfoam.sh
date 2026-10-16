#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7/runtime
mkdir -p "$base/openfoam-debs" "$base/openfoam"
cd "$base/openfoam-debs"
apt-get download openfoam libopenfoam libopenmpi3 openmpi-bin libptscotch-6.1 libscotch-6.1
for package in ./*.deb; do dpkg-deb -x "$package" "$base/openfoam"; done
ldd "$base/openfoam/usr/bin/simpleFoam"
