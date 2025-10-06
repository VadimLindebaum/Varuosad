// server.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const csv = require('csv-parser'); // https://www.npmjs.com/package/csv-parser
const morgan = require('morgan');
const chokidar = require('chokidar'); // optional: watch file changes

const CSV_FILE = path.join(__dirname, 'LE.txt');
const PORT = process.env.PORT || 3000;

let parts = [];         // array of objects (full dataset in memory)
let serialIndex = new Map(); // Map<serial, part>

// utility to try parse numbers
function tryNumber(v) {
  if (v === null || v === undefined) return v;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

// load CSV into memory (replaces existing data atomically)
function loadCsvToMemory() {
  return new Promise((resolve, reject) => {
    const tempParts = [];
    const tempIndex = new Map();

    const stream = fs.createReadStream(CSV_FILE)
      .on('error', (err) => reject(err))
      .pipe(csv({ separator: ',', mapHeaders: ({ header }) => header.trim() }));

    stream.on('data', (row) => {
      // normalize keys: trim spaces
      Object.keys(row).forEach(k => {
        if (typeof row[k] === 'string') row[k] = row[k].trim();
      });

      // standardize some common fields - change according to your CSV header names
      const part = {
        // copy all fields
        ...row,
        // expose canonical properties if present in CSV
        serial: row.serial || row.Serial || row.SERIAL || row['seerianumber'] || row['Seerianumber'] || row['seriaalinumber'] || row['Seriaalinumber'],
        name: row.name || row.Name || row.Nimi || row.nimi,
        // example numeric field parsing (if CSV has price/qty)
        price: tryNumber(row.price || row.Price || row.hind),
        qty: tryNumber(row.qty || row.Qty || row.quantity || row.Quantity)
      };

      tempParts.push(part);

      // build simple serial index if serial exists
      if (part.serial) {
        tempIndex.set(String(part.serial).toLowerCase(), part);
      }
    });

    stream.on('end', () => {
      // atomic swap
      parts = tempParts;
      serialIndex = tempIndex;
      console.log(`Loaded ${parts.length} parts into memory.`);
      resolve({ count: parts.length });
    });

    stream.on('error', (err) => reject(err));
  });
}

// create server
const app = express();
app.use(express.json());
app.use(morgan('tiny'));

// GET /parts - list + filtering + pagination + sorting
// Query params:
//  - query (string): search in name (substring, case-insensitive)
//  - serial (string): filter by serial (exact, case-insensitive)
//  - limit (int): items per page (default 50, max 1000)
//  - page (int): page number (1-based, default 1)
//  - sort_by (string): any field name present on the object
//  - sort_order (asc|desc): default asc
app.get('/parts', (req, res) => {
  try {
    const { query, serial, limit = 50, page = 1, sort_by, sort_order = 'asc' } = req.query;
    let results = parts;

    // serial exact filter is fast if indexed
    if (serial) {
      const found = serialIndex.get(String(serial).toLowerCase());
      if (!found) {
        return res.json({
          total: 0,
          page: Number(page),
          per_page: Number(limit),
          data: []
        });
      }
      // if other filters/pagination requested, treat single result as dataset
      results = [found];
    } else {
      // name/text search
      if (query) {
        const q = String(query).toLowerCase();
        results = results.filter(p => {
          const name = (p.name || '').toString().toLowerCase();
          // you can also search other fields here
          return name.includes(q) || (p.serial && p.serial.toString().toLowerCase().includes(q));
        });
      }
    }

    // sorting
    if (sort_by) {
      const key = sort_by;
      const direction = sort_order === 'desc' ? -1 : 1;
      results = results.slice(); // copy
      results.sort((a, b) => {
        const va = a[key];
        const vb = b[key];

        // handle numbers vs strings
        const na = typeof va === 'number' ? va : tryNumber(va);
        const nb = typeof vb === 'number' ? vb : tryNumber(vb);

        if (typeof na === 'number' && typeof nb === 'number') {
          return (na - nb) * direction;
        }
        const sa = (na === undefined || na === null) ? '' : String(na).toLowerCase();
        const sb = (nb === undefined || nb === null) ? '' : String(nb).toLowerCase();
        if (sa < sb) return -1 * direction;
        if (sa > sb) return 1 * direction;
        return 0;
      });
    }

    // pagination
    const perPage = Math.min(1000, Math.max(1, Number(limit) || 50));
    const p = Math.max(1, Number(page) || 1);
    const total = results.length;
    const start = (p - 1) * perPage;
    const end = start + perPage;
    const pageData = results.slice(start, end);

    res.json({
      total,
      page: p,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
      data: pageData
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// fast exact lookup by serial
app.get('/parts/:serial', (req, res) => {
  const serial = String(req.params.serial).toLowerCase();
  const found = serialIndex.get(serial);
  if (!found) return res.status(404).json({ error: 'Not found' });
  res.json(found);
});

// manual reload endpoint (POST) - useful after nightly CSV replacement
app.post('/reload', async (req, res) => {
  try {
    await loadCsvToMemory();
    res.json({ ok: true, count: parts.length });
  } catch (err) {
    console.error('Reload error:', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// optional: watch CSV for changes and auto-reload (uncomment to enable)
function watchCsvFile() {
  try {
    const watcher = chokidar.watch(CSV_FILE, { persistent: true, ignoreInitial: true });
    watcher.on('change', async (path) => {
      console.log(`File changed: ${path}. Reloading into memory...`);
      try {
        await loadCsvToMemory();
      } catch (e) {
        console.error('Auto-reload failed:', e);
      }
    });
  } catch (e) {
    console.warn('File watcher unavailable', e);
  }
}

// start server after initial load
(async () => {
  try {
    console.log('Loading CSV into memory...');
    await loadCsvToMemory();
    // uncomment to auto-watch file
    // watchCsvFile();
    app.listen(PORT, () => {
      console.log(`API server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to load CSV on startup:', err);
    process.exit(1);
  }
})();
