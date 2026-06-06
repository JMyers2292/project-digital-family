// Disables Node.js 22 Happy Eyeballs for environments with no IPv6 routing (e.g. Raspberry Pi on WiFi).
// Without this, simultaneous IPv4+IPv6 attempts cause TLS handshakes to ETIMEDOUT even though IPv4 works.
// Loaded via NODE_OPTIONS=--require on Pi; not used on dev machines.
require("net").setDefaultAutoSelectFamily(false);
