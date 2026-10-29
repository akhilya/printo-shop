# Changelog

Notable changes to this project are recorded here.

## [Unreleased]

### Added

- Added Ozon Delivery API support for individual orders, pickup-point discovery, posting approval, labels, status checks, and cancellation.
- Added separate Delivery API credentials, shipment-method and parcel settings, plus safe catalog fallback when Seller order creation has not started.

### Changed

- Kept Seller API as the primary provider for catalog items it accepts; Delivery API fallback requires a physical pickup-point match by address and coordinates.
