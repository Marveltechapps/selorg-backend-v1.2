/**
 * Inventory Location Util - formats zone/aisle/rack/shelf (bin) as location code.
 * StorageLocation: zone, aisle, rack, shelf. Shelf serves as bin.
 * Format: Zone-Aisle-Rack-Bin e.g. "A-3-B-12"
 */
function formatLocationCode(zone, aisle, rack, shelfOrBin) {
  const parts = [zone, aisle, rack, shelfOrBin].filter((p) => p != null && p !== '');
  return parts.join('-') || null;
}

/**
 * Parse location code "A-3-B-12" into { zone, aisle, rack, bin }
 */
function parseLocationCode(code) {
  if (!code || typeof code !== 'string') return null;
  const parts = code.split('-');
  if (parts.length < 4) return null;
  return {
    zone: parts[0],
    aisle: parts[1],
    rack: parts[2],
    bin: parts[3],
  };
}

/**
 * Build location code from StorageLocation doc
 */
function fromStorageLocation(loc) {
  if (!loc) return null;
  return formatLocationCode(loc.zone, loc.aisle, loc.rack, loc.shelf ?? loc.bin);
}

module.exports = {
  formatLocationCode,
  parseLocationCode,
  fromStorageLocation,
};
