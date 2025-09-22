#!/usr/bin/env node

/**
 * Shopify Product Variants Import Script
 * Imports product variants with metafields from edited CSV
 *
 * Usage: node import-variants.js [options]
 * Options:
 *   --shop <shop-name>     Shopify shop name (required)
 *   --token <access-token> Admin API access token (required)
 *   --input <filename>     Input CSV filename (required)
 *   --dry-run              Preview changes without applying them
 *   --batch-size <number>  Number of variants to process per batch (default: 10)
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// Configuration
const config = {
  shop: process.env.SHOPIFY_SHOP || "",
  token: process.env.SHOPIFY_ACCESS_TOKEN || "",
  input: "",
  dryRun: false,
  batchSize: 10,
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--shop":
        config.shop = args[++i];
        break;
      case "--token":
        config.token = args[++i];
        break;
      case "--input":
        config.input = args[++i];
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--batch-size":
        config.batchSize = parseInt(args[++i]);
        break;
      case "--help":
        console.log(`
Usage: node import-variants.js [options]

Options:
  --shop <shop-name>     Shopify shop name (required)
  --token <access-token> Admin API access token (required)
  --input <filename>     Input CSV filename (required)
  --dry-run              Preview changes without applying them
  --batch-size <number>  Number of variants to process per batch (default: 10)
  --help                 Show this help message

Environment Variables:
  SHOPIFY_SHOP          Shopify shop name
  SHOPIFY_ACCESS_TOKEN  Admin API access token
        `);
        process.exit(0);
        break;
    }
  }
}

// Validate configuration
function validateConfig() {
  if (!config.shop) {
    console.error(
      "Error: Shop name is required. Use --shop or set SHOPIFY_SHOP environment variable."
    );
    process.exit(1);
  }
  if (!config.token) {
    console.error(
      "Error: Access token is required. Use --token or set SHOPIFY_ACCESS_TOKEN environment variable."
    );
    process.exit(1);
  }
  if (!config.input) {
    console.error("Error: Input CSV file is required. Use --input <filename>");
    process.exit(1);
  }
  if (!fs.existsSync(config.input)) {
    console.error(`Error: Input file '${config.input}' does not exist.`);
    process.exit(1);
  }
}

// Parse CSV content
function parseCSV(content) {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error(
      "CSV file must have at least a header row and one data row"
    );
  }

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) {
      console.warn(
        `Warning: Row ${i + 1} has ${values.length} values but expected ${
          headers.length
        }`
      );
      continue;
    }

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    data.push(row);
  }

  return data;
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

// Make GraphQL request to Shopify
function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${config.shop}.myshopify.com`,
      port: 443,
      path: `/admin/api/2023-10/graphql.json`,
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": config.token,
        "Content-Type": "application/json",
      },
    };

    const requestBody = JSON.stringify({ query: query, variables: variables });

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const jsonData = JSON.parse(data);
          if (jsonData.errors) {
            reject(
              new Error(`GraphQL errors: ${JSON.stringify(jsonData.errors)}`)
            );
          } else {
            resolve(jsonData.data);
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(requestBody);
    req.end();
  });
}

// Update variant metafields using GraphQL bulk update
async function updateVariantMetafields(variantId, metafields) {
  if (metafields.length === 0) {
    return [];
  }

  try {
    if (config.dryRun) {
      console.log(`  [DRY RUN] Would update ${metafields.length} metafields:`);
      metafields.forEach((metafield) => {
        console.log(
          `    ${metafield.namespace}.${metafield.key} = ${metafield.value}`
        );
      });
      return metafields.map((metafield) => ({
        success: true,
        metafield,
        action: "dry-run",
      }));
    }

    // Extract product ID from variant ID
    const productId = await getProductIdFromVariantId(variantId);
    if (!productId) {
      throw new Error(`Could not find product for variant ${variantId}`);
    }

    const query = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
          }
          productVariants {
            id
            metafields(first: 10) {
              edges {
                node {
                  namespace
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      productId: productId,
      variants: [
        {
          id: variantId,
          metafields: metafields.map((metafield) => ({
            namespace: metafield.namespace,
            key: metafield.key,
            value: metafield.value,
            type: metafield.type || "single_line_text_field",
          })),
        },
      ],
    };

    const response = await makeGraphQLRequest(query, variables);

    if (response.productVariantsBulkUpdate.userErrors.length > 0) {
      const errors = response.productVariantsBulkUpdate.userErrors;
      throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
    }

    return metafields.map((metafield) => ({
      success: true,
      metafield,
      response,
    }));
  } catch (error) {
    console.error(
      `  Error updating metafields for variant ${variantId}:`,
      error.message
    );
    return metafields.map((metafield) => ({
      success: false,
      metafield,
      error: error.message,
    }));
  }
}

// Get product ID from variant ID
async function getProductIdFromVariantId(variantId) {
  try {
    const query = `
      query getVariant($id: ID!) {
        productVariant(id: $id) {
          id
          product {
            id
          }
        }
      }
    `;

    const response = await makeGraphQLRequest(query, { id: variantId });
    return response.productVariant?.product?.id;
  } catch (error) {
    console.error(
      `Error getting product ID for variant ${variantId}:`,
      error.message
    );
    return null;
  }
}

// Extract metafields from CSV row
function extractMetafields(row) {
  const metafields = [];

  Object.keys(row).forEach((key) => {
    if (key.startsWith("metafield_") && row[key]) {
      const parts = key.replace("metafield_", "").split("_");
      if (parts.length >= 2) {
        const namespace = parts[0];
        const metafieldKey = parts.slice(1).join("_");

        metafields.push({
          namespace: namespace,
          key: metafieldKey,
          value: row[key],
          type: "single_line_text_field", // Default type, can be customized
        });
      }
    }
  });

  return metafields;
}

// Process variants in batches
async function processBatch(variants) {
  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  for (const variant of variants) {
    try {
      const variantId = variant.variant_id;
      const metafields = extractMetafields(variant);

      if (metafields.length === 0) {
        console.log(
          `  Skipping variant ${variantId} - no metafields to update`
        );
        results.skipped++;
        continue;
      }

      console.log(
        `  Processing variant ${variantId} (${variant.variant_title}) - ${metafields.length} metafields`
      );

      const metafieldResults = await updateVariantMetafields(
        variantId,
        metafields
      );

      const successCount = metafieldResults.filter((r) => r.success).length;
      const failCount = metafieldResults.filter((r) => !r.success).length;

      if (failCount === 0) {
        results.success++;
        console.log(`    ✓ Successfully updated ${successCount} metafields`);
      } else {
        results.failed++;
        console.log(
          `    ✗ Failed to update ${failCount} of ${metafields.length} metafields`
        );
      }

      results.details.push({
        variantId,
        variantTitle: variant.variant_title,
        metafieldResults,
      });
    } catch (error) {
      console.error(
        `  Error processing variant ${variant.variant_id}:`,
        error.message
      );
      results.failed++;
      results.details.push({
        variantId: variant.variant_id,
        variantTitle: variant.variant_title,
        error: error.message,
      });
    }
  }

  return results;
}

// Main import function
async function importVariants() {
  try {
    console.log("Starting variant import...");

    if (config.dryRun) {
      console.log("🔍 DRY RUN MODE - No changes will be applied");
    }

    // Read and parse CSV
    console.log(`Reading CSV file: ${config.input}`);
    const csvContent = fs.readFileSync(config.input, "utf8");
    const variants = parseCSV(csvContent);

    console.log(`Found ${variants.length} variants to process`);

    // Process in batches
    const totalResults = {
      success: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };

    for (let i = 0; i < variants.length; i += config.batchSize) {
      const batch = variants.slice(i, i + config.batchSize);
      console.log(
        `\nProcessing batch ${Math.floor(i / config.batchSize) + 1} (${
          batch.length
        } variants)...`
      );

      const batchResults = await processBatch(batch);

      totalResults.success += batchResults.success;
      totalResults.failed += batchResults.failed;
      totalResults.skipped += batchResults.skipped;
      totalResults.details.push(...batchResults.details);

      // Add delay between batches to avoid rate limiting
      if (i + config.batchSize < variants.length && !config.dryRun) {
        console.log("  Waiting 1 second before next batch...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(50));
    console.log("IMPORT SUMMARY");
    console.log("=".repeat(50));
    console.log(`Total variants processed: ${variants.length}`);
    console.log(`Successfully updated: ${totalResults.success}`);
    console.log(`Failed: ${totalResults.failed}`);
    console.log(`Skipped: ${totalResults.skipped}`);

    if (config.dryRun) {
      console.log("\n🔍 This was a dry run. No actual changes were made.");
      console.log("Run without --dry-run to apply the changes.");
    }

    // Save detailed results
    const resultsFile = config.input.replace(".csv", "-import-results.json");
    fs.writeFileSync(resultsFile, JSON.stringify(totalResults, null, 2));
    console.log(`\nDetailed results saved to: ${resultsFile}`);
  } catch (error) {
    console.error("Import failed:", error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  parseArgs();
  validateConfig();
  importVariants();
}

module.exports = {
  importVariants,
  parseCSV,
  makeGraphQLRequest,
  updateVariantMetafields,
  getProductIdFromVariantId,
};
