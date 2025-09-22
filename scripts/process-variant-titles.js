#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Configuration
const config = {
  inputFile: "variants-export.copy.csv",
  outputFile: "variants-export.processed.csv",
  dryRun: false,
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--input":
        config.inputFile = args[++i];
        break;
      case "--output":
        config.outputFile = args[++i];
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--help":
        console.log(`
Usage: node process-variant-titles.js [options]

Options:
  --input <file>     Input CSV file (default: variants-export.copy.csv)
  --output <file>    Output CSV file (default: variants-export.processed.csv)
  --dry-run          Show what would be changed without writing files
  --help             Show this help message

This script processes variant titles that contain both title and SKU in the format "{title} {sku}":
- Splits the variant_title into title and SKU parts
- Sets metafield_custom_nielsen_sku to the SKU part
- Sets metafield_custom_variant_label to the title part
- Updates variant_title to just the title part

Examples:
  node process-variant-titles.js
  node process-variant-titles.js --input my-file.csv --output processed.csv
  node process-variant-titles.js --dry-run
        `);
        process.exit(0);
        break;
    }
  }
}

// Parse CSV content
function parseCSV(content) {
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

// Convert back to CSV
function toCSV(headers, rows) {
  const csvRows = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map((header) => row[header] || "");
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

// Check if a variant title contains both title and SKU
function hasTitleAndSku(variantTitle) {
  if (!variantTitle || typeof variantTitle !== "string") {
    return false;
  }

  // Look for pattern: title followed by space and SKU (SKU typically starts with R and has numbers)
  const match = variantTitle.match(/^(.+?)\s+(R[A-Z0-9]+)$/);
  return match ? { title: match[1].trim(), sku: match[2] } : null;
}

// Process a single row
function processRow(row) {
  const changes = [];
  const result = { ...row };

  // Check if variant_title contains both title and SKU
  const titleSkuMatch = hasTitleAndSku(row.variant_title);

  if (titleSkuMatch) {
    const { title, sku } = titleSkuMatch;

    // Keep variant_title unchanged - don't modify it
    // result.variant_title remains as is

    // Set metafield_custom_nielsen_sku with the extracted SKU
    if (result.metafield_custom_nielsen_sku !== sku) {
      changes.push(
        `metafield_custom_nielsen_sku: "${result.metafield_custom_nielsen_sku}" → "${sku}"`
      );
      result.metafield_custom_nielsen_sku = sku;
    }

    // Set metafield_custom_variant_label to the title part (without SKU)
    if (result.metafield_custom_variant_label !== title) {
      changes.push(
        `metafield_custom_variant_label: "${result.metafield_custom_variant_label}" → "${title}"`
      );
      result.metafield_custom_variant_label = title;
    }
  } else {
    // If no SKU found in title, set variant_label to the full title
    if (result.metafield_custom_variant_label !== row.variant_title) {
      changes.push(
        `metafield_custom_variant_label: "${result.metafield_custom_variant_label}" → "${row.variant_title}"`
      );
      result.metafield_custom_variant_label = row.variant_title;
    }
  }

  return { result, changes };
}

// Main processing function
async function processVariantTitles() {
  try {
    console.log("🔍 Processing variant titles...");
    console.log(`📁 Input file: ${config.inputFile}`);
    console.log(`📁 Output file: ${config.outputFile}`);

    if (config.dryRun) {
      console.log("🧪 DRY RUN MODE - No files will be written");
    }

    // Check if input file exists
    if (!fs.existsSync(config.inputFile)) {
      throw new Error(`Input file not found: ${config.inputFile}`);
    }

    // Read and parse CSV
    console.log("📖 Reading CSV file...");
    const content = fs.readFileSync(config.inputFile, "utf8");
    const { headers, rows } = parseCSV(content);

    console.log(`📊 Found ${rows.length} rows to process`);

    // Process each row
    let processedCount = 0;
    let totalChanges = 0;
    const processedRows = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { result, changes } = processRow(row);

      if (changes.length > 0) {
        processedCount++;
        totalChanges += changes.length;

        console.log(`\n📝 Row ${i + 1} (${row.variant_id}):`);
        changes.forEach((change) => {
          console.log(`   ${change}`);
        });
      }

      processedRows.push(result);
    }

    console.log(`\n✅ Processing complete!`);
    console.log(`📈 Summary:`);
    console.log(`   - Rows processed: ${processedCount}/${rows.length}`);
    console.log(`   - Total changes: ${totalChanges}`);

    if (!config.dryRun && processedCount > 0) {
      // Write output file
      console.log(`💾 Writing output file: ${config.outputFile}`);
      const outputContent = toCSV(headers, processedRows);
      fs.writeFileSync(config.outputFile, outputContent, "utf8");
      console.log("✅ Output file written successfully!");
    } else if (config.dryRun) {
      console.log("🧪 Dry run complete - no files written");
    } else {
      console.log("ℹ️  No changes needed - no output file written");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  parseArgs();
  processVariantTitles();
}

module.exports = {
  processVariantTitles,
  parseCSV,
  toCSV,
  hasTitleAndSku,
  processRow,
};
