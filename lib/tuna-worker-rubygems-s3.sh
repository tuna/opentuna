#!/bin/sh

cd /rubygems-mirror-s3

mkdir -p $HOME/.gem
cat >"$HOME/.gem/.mirrorrc" << EOF
---
- from: https://rubygems.org
  to: /rubygems
  region: {{&region}}
  bucket: $S3_BUCKET
  parallelism: 10
  retries: 2
  delete: true
  skiperror: true
EOF

timeout -s INT 7200 bundle exec gem mirror