# Vendored scripts of the Mondial Relay picker

The checkout loads the Mondial Relay Parcel Shop Picker on demand
(`src/cart/relay-widget.ts`). Its two dependencies are served from this
folder, on the shop's own origin, so the checkout CSP needs no third-party
script host other than `widget.mondialrelay.com`. The files are unmodified
copies, downloaded once on 2026-11-01. Licences sit next to them.

| Served path                                | Source URL                                                         | sha384                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `/vendor/jquery/jquery-2.2.4.min.js`       | https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js   | `sha384-rY/jv8mMhqDabXSo+UCggqKtdmBfd3qC2/KvyTDNQ6PcUJXaxK1tMepoQda4g5vB` |
| `/vendor/jquery/LICENSE.txt`               | https://unpkg.com/jquery@2.2.4/LICENSE.txt                         |                                                                           |
| `/vendor/leaflet/leaflet.js`               | https://unpkg.com/leaflet@1.9.4/dist/leaflet.js                    | `sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH` |
| `/vendor/leaflet/leaflet.css`              | https://unpkg.com/leaflet@1.9.4/dist/leaflet.css                   | `sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H` |
| `/vendor/leaflet/images/layers.png`        | https://unpkg.com/leaflet@1.9.4/dist/images/layers.png             | `sha384-80x85ZS+G189o0xL8E8D7BnfhuNss6EwUPHzG7e+qByRD2xnpxikZ6UQU4Re5nNy` |
| `/vendor/leaflet/images/layers-2x.png`     | https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png          | `sha384-+F2ZWK/HTpkV9kN2HnMGCQOTM/cnQJLs770FLOeHznwVWRfDESI8z4JwcGYmy2Au` |
| `/vendor/leaflet/images/marker-icon.png`   | https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png        | `sha384-wg83fCOXjBtqzFAWhTL9Sd9vmLUNhfEEzfmNUX9zwv2igKlz/YQbdapF4ObdxF+R` |
| `/vendor/leaflet/images/marker-icon-2x.png` | https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png     | `sha384-bDEa1RhAAKIr/VQnMZ7gUhhXwmKYB4V0g8AsxOvCEPwGxfHCUEzAEMAEEzkjuxiA` |
| `/vendor/leaflet/images/marker-shadow.png` | https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png      | `sha384-dB8ivfvPGb1MSIzX8oWTakCxmq+VwqP/QL1TX4jT4INR3pM5T4FgF3Gx4mN3NTMq` |
| `/vendor/leaflet/LICENSE`                  | https://unpkg.com/leaflet@1.9.4/LICENSE                            |                                                                           |

The jQuery file is byte-identical to https://code.jquery.com/jquery-2.2.4.min.js.
`leaflet.css` references `images/` relatively, so the folder layout matters.

Check a file against its hash:

```sh
openssl dgst -sha384 -binary public/vendor/leaflet/leaflet.js | openssl base64 -A
```

To upgrade, download the new version from the same CDN, replace the file,
update this table and the path in `src/cart/relay-widget.ts`, then re-run
`node scripts/relay-capture.mjs` (`docs/deployment.md`, section 11).
