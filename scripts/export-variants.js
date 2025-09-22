#!/usr/bin/env node

/**
 * Shopify Product Variants Export Script
 * Exports product variants with metafields to CSV for editing
 *
 * Usage: node export-variants.js [options]
 * Options:
 *   --shop <shop-name>     Shopify shop name (required)
 *   --token <access-token> Admin API access token (required)
 *   --output <filename>    Output CSV filename (default: variants-export.csv)
 *   --product-id <id>      Export specific product by ID (optional)
 *   --limit <number>       Limit number of products to process (default: 50)
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// Configuration
const config = {
  shop: process.env.SHOPIFY_SHOP || "",
  token: process.env.SHOPIFY_ACCESS_TOKEN || "",
  output: "variants-export.csv",
  productId: null,
  limit: 50,
  search: null,
  includeAllMetafields: false,
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
      case "--output":
        config.output = args[++i];
        break;
      case "--product-id":
        config.productId = args[++i];
        break;
      case "--limit":
        config.limit = parseInt(args[++i]);
        break;
      case "--search":
        config.search = args[++i];
        break;
      case "--include-all-metafields":
        config.includeAllMetafields = true;
        break;
      case "--help":
        console.log(`
Usage: node export-variants.js [options]

Options:
  --shop <shop-name>     Shopify shop name (required)
  --token <access-token> Admin API access token (required)
  --output <filename>    Output CSV filename (default: variants-export.csv)
  --product-id <id>      Export specific product by ID (optional)
  --search <term>        Search for products by title, handle, or tags (optional)
  --limit <number>       Limit number of products to process (default: 50)
  --include-all-metafields Include all metafields (default: only custom metafields)
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

    const requestBody = JSON.stringify({
      query: query,
      variables: variables,
    });

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
          reject(new Error(`Failed to parse JSON: ${error.message}`));
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

// Get all products or specific product
async function getProducts() {
  try {
    if (config.productId) {
      console.log(`Fetching product ${config.productId}...`);
      const query = `
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            title
            handle
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  barcode
                  price
                  compareAtPrice
                  inventoryQuantity
                  inventoryPolicy
                  taxable
                  createdAt
                  updatedAt
                  selectedOptions {
                    name
                    value
                  }
                  metafields(first: 50) {
                    edges {
                      node {
                        namespace
                        key
                        value
                        type
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const response = await makeGraphQLRequest(query, {
        id: `gid://shopify/Product/${config.productId}`,
      });
      return [response.product];
    } else {
      let query = `
        query getProducts($first: Int!, $query: String) {
          products(first: $first, query: $query) {
            edges {
              node {
                id
                title
                handle
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      sku
                      barcode
                      price
                      compareAtPrice
                      inventoryQuantity
                      inventoryPolicy
                      taxable
                      createdAt
                      updatedAt
                      selectedOptions {
                        name
                        value
                      }
                      metafields(first: 50) {
                        edges {
                          node {
                            namespace
                            key
                            value
                            type
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables = { first: config.limit };

      if (config.search) {
        variables.query = `title:*${config.search}*`;
        console.log(`Searching for products matching: "${config.search}"`);
      } else {
        console.log(`Fetching products (limit: ${config.limit})...`);
      }

      const response = await makeGraphQLRequest(query, variables);
      return response.products.edges.map((edge) => edge.node);
    }
  } catch (error) {
    console.error("Error fetching products:", error.message);
    throw error;
  }
}

// Get metafield definitions for variants
async function getVariantMetafieldDefinitions() {
  try {
    console.log("Fetching variant metafield definitions...");
    const query = `
      query getMetafieldDefinitions($first: Int!) {
        metafieldDefinitions(first: $first, ownerType: PRODUCTVARIANT) {
          edges {
            node {
              id
              namespace
              key
              name
              type {
                name
              }
            }
          }
        }
      }
    `;

    const response = await makeGraphQLRequest(query, {
      first: 250,
    });

    // Filter out app-specific metafields and focus on custom ones (unless --include-all-metafields is used)
    let filteredMetafields = response.metafieldDefinitions.edges.map(
      (edge) => edge.node
    );

    if (!config.includeAllMetafields) {
      filteredMetafields = filteredMetafields.filter((metafield) => {
        // Include only custom namespace or specific namespaces we care about
        const namespace = metafield.namespace;

        // Exclude common app namespaces
        const excludedNamespaces = [
          "shopify",
          "global",
          "reviews",
          "judge_me",
          "yotpo",
          "stamped",
          "loox",
          "okendo",
          "gorgias",
          "klaviyo",
          "mailchimp",
          "privy",
          "bold",
          "recharge",
          "subscription",
          "upsell",
          "cross_sell",
          "product_bundles",
          "inventory_quantity",
          "inventory_management",
        ];

        // Include custom namespace and any others not in the excluded list
        return (
          namespace === "custom" || !excludedNamespaces.includes(namespace)
        );
      });
    }

    console.log(
      `Found ${response.metafieldDefinitions.edges.length} total metafields, ${filteredMetafields.length} filtered metafields`
    );

    return filteredMetafields;
  } catch (error) {
    console.warn(
      "Warning: Could not fetch metafield definitions:",
      error.message
    );
    return [];
  }
}

// Get metafields for a product variant (now handled in the main query)
function extractVariantMetafields(variant) {
  return variant.metafields?.edges?.map((edge) => edge.node) || [];
}

// Convert metafields to flat object
function flattenMetafields(metafields) {
  const flattened = {};

  // Add actual metafields
  metafields.forEach((metafield) => {
    const key = `metafield_${metafield.namespace}_${metafield.key}`;
    flattened[key] = metafield.value;
  });

  return flattened;
}

// Convert data to CSV format
function arrayToCSV(data) {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header] || "";
          // Escape commas and quotes in CSV
          if (
            typeof value === "string" &&
            (value.includes(",") || value.includes('"') || value.includes("\n"))
          ) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",")
    ),
  ].join("\n");

  return csvContent;
}

// Main export function
async function exportVariants() {
  try {
    console.log("Starting variant export...");

    // First, get all metafield definitions to know what fields exist
    const metafieldDefinitions = await getVariantMetafieldDefinitions();
    const allMetafieldKeys = new Set();

    // Extract metafield keys from definitions
    metafieldDefinitions.forEach((metafield) => {
      const key = `metafield_${metafield.namespace}_${metafield.key}`;
      allMetafieldKeys.add(key);
    });

    console.log(
      `\nFound metafield definitions: ${Array.from(allMetafieldKeys).join(
        ", "
      )}`
    );

    const products = await getProducts();
    console.log(`Found ${products.length} products`);

    const allVariants = [];

    // Process all variants and create records with all metafield columns
    for (const product of products) {
      console.log(`Processing product: ${product.title} (ID: ${product.id})`);

      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        console.log(
          `  Processing variant: ${variant.title} (ID: ${variant.id})`
        );

        // Get metafields for this variant
        const metafields = extractVariantMetafields(variant);
        const flattenedMetafields = flattenMetafields(metafields);

        // Extract option values from selectedOptions
        const option1 =
          variant.selectedOptions?.find((opt) => opt.name === "Option1")
            ?.value || "";
        const option2 =
          variant.selectedOptions?.find((opt) => opt.name === "Option2")
            ?.value || "";
        const option3 =
          variant.selectedOptions?.find((opt) => opt.name === "Option3")
            ?.value || "";

        // Create variant record with all metafield columns
        const variantRecord = {
          product_id: product.id,
          product_title: product.title,
          product_handle: product.handle,
          variant_id: variant.id,
          variant_title: variant.title,
          variant_sku: variant.sku || "",
          variant_barcode: variant.barcode || "",
          variant_price: variant.price?.amount || "",
          variant_compare_at_price: variant.compareAtPrice?.amount || "",
          variant_inventory_quantity: variant.inventoryQuantity || 0,
          variant_inventory_policy: variant.inventoryPolicy || "",
          variant_taxable: variant.taxable,
          variant_option1: option1,
          variant_option2: option2,
          variant_option3: option3,
          variant_created_at: variant.createdAt,
          variant_updated_at: variant.updatedAt,
        };

        // Add all metafield columns (empty if not present for this variant)
        allMetafieldKeys.forEach((key) => {
          variantRecord[key] = flattenedMetafields[key] || "";
        });

        allVariants.push(variantRecord);
      }
    }

    console.log(`\nTotal variants processed: ${allVariants.length}`);

    // Generate CSV
    const csvContent = arrayToCSV(allVariants);

    // Write to file
    const outputPath = path.resolve(config.output);
    fs.writeFileSync(outputPath, csvContent, "utf8");

    console.log(`\nExport completed successfully!`);
    console.log(`CSV file saved to: ${outputPath}`);
    console.log(`\nNext steps:`);
    console.log(`1. Edit the CSV file to update metafields`);
    console.log(
      `2. Run the import script: node import-variants.js --input ${config.output}`
    );
  } catch (error) {
    console.error("Export failed:", error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  parseArgs();
  validateConfig();
  exportVariants();
}

module.exports = {
  exportVariants,
  makeGraphQLRequest,
  getProducts,
  extractVariantMetafields,
};
