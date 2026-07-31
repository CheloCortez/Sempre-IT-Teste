/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/api/supernaut/ready", (event) => {
  return event.json(200, { ok: true });
});

onRecordCreateRequest((event) => {
  // e.realIP() uses the configured trusted-proxy headers when available and
  // otherwise falls back to the direct remote address.
  const clientIp = event.realIP() || event.remoteIP();

  // PocketBase's JS runtime exposes MD5 but not SHA-256. This compact,
  // self-contained SHA-256 implementation only receives the ASCII IP address
  // returned by PocketBase and keeps the handler isolated from module scope.
  const sha256 = (input) => {
    const message = String(input);
    const words = [];
    const bitLength = message.length * 8;
    const constants = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
      0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
      0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
      0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
      0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
      0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
      0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
      0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
      0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
      0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    for (let i = 0; i < message.length; i += 1) {
      words[i >> 2] = (words[i >> 2] || 0) | (
        message.charCodeAt(i) << (24 - ((i % 4) * 8))
      );
    }
    words[bitLength >> 5] = (words[bitLength >> 5] || 0) |
      (0x80 << (24 - (bitLength % 32)));
    words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

    for (let chunk = 0; chunk < words.length; chunk += 16) {
      const schedule = new Array(64);
      for (let i = 0; i < 16; i += 1) {
        schedule[i] = words[chunk + i] || 0;
      }
      for (let i = 16; i < 64; i += 1) {
        const s0 = ((schedule[i - 15] >>> 7) | (schedule[i - 15] << 25)) ^
          ((schedule[i - 15] >>> 18) | (schedule[i - 15] << 14)) ^
          (schedule[i - 15] >>> 3);
        const s1 = ((schedule[i - 2] >>> 17) | (schedule[i - 2] << 15)) ^
          ((schedule[i - 2] >>> 19) | (schedule[i - 2] << 13)) ^
          (schedule[i - 2] >>> 10);
        schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) | 0;
      }

      let [a, b, c, d, e, f, g, h] = hash;
      for (let i = 0; i < 64; i += 1) {
        const sum1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^
          ((e >>> 25) | (e << 7));
        const choice = (e & f) ^ (~e & g);
        const temp1 = (h + sum1 + choice + constants[i] + schedule[i]) | 0;
        const sum0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^
          ((a >>> 22) | (a << 10));
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (sum0 + majority) | 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) | 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) | 0;
      }

      hash = [
        (hash[0] + a) | 0, (hash[1] + b) | 0, (hash[2] + c) | 0,
        (hash[3] + d) | 0, (hash[4] + e) | 0, (hash[5] + f) | 0,
        (hash[6] + g) | 0, (hash[7] + h) | 0,
      ];
    }

    return hash.map((value) => (
      `00000000${(value >>> 0).toString(16)}`.slice(-8)
    )).join("");
  };

  const fingerprint = sha256(`pickleworld-checkin-rate-limit-v1:${clientIp}`);
  const venueId = event.record.getString("venue");
  const cutoff = new DateTime().add(-10 * 60 * 1000000000).string();
  const recentCheckins = event.app.findRecordsByFilter(
    "checkins",
    "venue = {:venue} && rate_limit_fingerprint = {:fingerprint} && rate_limit_created_at >= {:cutoff}",
    "-rate_limit_created_at",
    1,
    0,
    { venue: venueId, fingerprint, cutoff },
  );

  if (recentCheckins.length > 0) {
    throw event.tooManyRequestsError(
      "Aguarde 10 minutos antes de enviar outro check-in neste local.",
      {},
    );
  }

  // Never trust a client-provided fingerprint and never store the raw IP.
  event.record.set("rate_limit_fingerprint", fingerprint);
  event.next();
}, "checkins");
