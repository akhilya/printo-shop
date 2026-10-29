# Changelog

Notable changes to this project are recorded here.

## [Unreleased]

### Added

- Added Ozon Delivery API support for individual orders, pickup-point discovery, posting approval, labels, status checks, and cancellation.
- Added separate Delivery API credentials, automatic active shipment-method discovery, parcel settings, and safe catalog fallback before Seller order creation starts.

### Changed

- Kept Seller API as the primary provider for catalog items it accepts; Delivery API fallback requires a physical pickup-point match by address and coordinates.
