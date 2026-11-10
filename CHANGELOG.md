# Changelog

Notable changes to this project are recorded here.

## [Unreleased]

### Added

- Added order lookup by confirming the email address or phone number used when placing it.
- Added Ozon Delivery API support for individual orders, pickup-point discovery, posting approval, labels, status checks, and cancellation.
- Added separate Delivery API credentials, automatic active shipment-method discovery, parcel settings, and safe catalog fallback before Seller order creation starts.
- Added an admin order action to explicitly create an errored order through Delivery API without a Seller article.

### Changed

- Kept Seller API as the primary provider for catalog items it accepts; Delivery API fallback requires a physical pickup-point match by address and coordinates.
- Included provider, shipment-method, safe pickup-point match, and sanitized Delivery API request/response error diagnostics in failed Ozon order logs and order metadata.

### Fixed

- Requested the dedicated `delivery-api.shipment-method` permission when searching Ozon delivery methods.
- Limited Ozon Delivery API pickup-point detail requests to 100 IDs per batch.
- Refreshed Ozon Delivery API tokens using absolute expiry timestamps when returned and retried requests once after an authorization failure.
- Shared concurrent Seller API token refreshes to avoid reusing a rotated refresh token.
