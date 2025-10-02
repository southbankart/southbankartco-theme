#!/usr/bin/env node

/**
 * Shopify Product Template Bulk Update Script
 * Updates product theme templates in bulk with filtering capabilities
 *
 * Usage: node update-product-templates.js [options]
 * Options:
 *   --shop <shop-name>        Shopify shop name (required)
 *   --token <access-token>    Admin API access token (required)
 *   --template <template>     Theme template to apply (required)
 *   --filter-tag <tag>        Filter products by tag
 *   --filter-vendor <vendor>  Filter products by vendor
 *   --filter-type <type>      Filter products by product type
 *   --filter-collection <id>  Filter products by collection ID
 *   --search <term>           Search products by title or handle
 *   --product-ids <ids>       Comma-separated list of specific product IDs
 *   --limit <number>          Limit number of products to process (default: 50)
 *   --dry-run                 Preview changes without applying them
 *   --force                   Skip confirmation prompt
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Configuration
const config = {
  shop: process.env.SHOPIFY_SHOP || "",
  token: process.env.SHOPIFY_ACCESS_TOKEN || "",
  template: "",
  filters: {
    tag: null,
    vendor: null,
    type: null,
    collection: null,
    search: null,
    productIds: null,
  },
  limit: 250,
  dryRun: false,
  force: false,
};

// Available theme templates (from your templates directory)
const availableTemplates = [
  "product",
  "product.collect-in-store",
  "product.custom-mount",
  "product.framed-artwork",
  "product.nielsen-ready-made-frames",
];

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
      case "--template":
        config.template = args[++i];
        break;
      case "--filter-tag":
        config.filters.tag = args[++i];
        break;
      case "--filter-vendor":
        config.filters.vendor = args[++i];
        break;
      case "--filter-type":
        config.filters.type = args[++i];
        break;
      case "--filter-collection":
        config.filters.collection = args[++i];
        break;
      case "--search":
        config.filters.search = args[++i];
        break;
      case "--product-ids":
        config.filters.productIds = args[++i].split(",").map((id) => id.trim());
        break;
      case "--limit":
        config.limit = parseInt(args[++i]);
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
      case "--force":
        config.force = true;
        break;
      case "--help":
        console.log(`
Usage: node update-product-templates.js [options]

Options:
  --shop <shop-name>        Shopify shop name (required)
  --token <access-token>    Admin API access token (required)
  --template <template>     Theme template to apply (required)
  --filter-tag <tag>        Filter products by tag
  --filter-vendor <vendor>  Filter products by vendor
  --filter-type <type>      Filter products by product type
  --filter-collection <id>  Filter products by collection ID
  --search <term>           Search products by title or handle
  --product-ids <ids>       Comma-separated list of specific product IDs
  --limit <number>          Limit number of products to process (default: 50)
  --dry-run                 Preview changes without applying them
  --force                   Skip confirmation prompt
  --help                    Show this help message

Available Templates:
  ${availableTemplates.join("\n  ")}

Environment Variables:
  SHOPIFY_SHOP          Shopify shop name
  SHOPIFY_ACCESS_TOKEN  Admin API access token

Examples:
  # Update all products with tag "artwork" to use framed-artwork template
  node update-product-templates.js --template product.framed-artwork --filter-tag artwork

  # Update products by vendor to custom-mount template
  node update-product-templates.js --template product.custom-mount --filter-vendor "Southbank Art"

  # Update specific products by ID
  node update-product-templates.js --template product.framed-artwork --product-ids "123,456,789"

  # Dry run to preview changes
  node update-product-templates.js --template product.framed-artwork --filter-tag artwork --dry-run
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
  if (!config.template) {
    console.error("Error: Template is required. Use --template option.");
    console.error(`Available templates: ${availableTemplates.join(", ")}`);
    process.exit(1);
  }
  if (!availableTemplates.includes(config.template)) {
    console.error(`Error: Invalid template "${config.template}".`);
    console.error(`Available templates: ${availableTemplates.join(", ")}`);
    process.exit(1);
  }
}

// Make GraphQL request to Shopify
function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${config.shop}.myshopify.com`,
      port: 443,
      path: `/admin/api/2024-10/graphql.json`,
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

// Build GraphQL query based on filters
function buildProductsQuery() {
  let query = `
    query getProducts($first: Int!, $query: String) {
      products(first: $first, query: $query) {
        edges {
          node {
            id
            title
            handle
            vendor
            productType
            tags
            templateSuffix
            status
            createdAt
            updatedAt
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const variables = { first: config.limit };
  let queryString = "";

  // Build query string based on filters
  const conditions = [];

  if (config.filters.tag) {
    conditions.push(`tag:${config.filters.tag}`);
  }
  if (config.filters.vendor) {
    conditions.push(`vendor:${config.filters.vendor}`);
  }
  if (config.filters.type) {
    conditions.push(`product_type:${config.filters.type}`);
  }
  if (config.filters.collection) {
    conditions.push(`collection_id:${config.filters.collection}`);
  }
  if (config.filters.search) {
    conditions.push(
      `title:*${config.filters.search}* OR handle:*${config.filters.search}*`
    );
  }

  if (conditions.length > 0) {
    queryString = conditions.join(" AND ");
  }

  variables.query = queryString;
  return { query, variables };
}

// Get products by specific IDs
async function getProductsByIds(productIds) {
  const products = [];

  for (const productId of productIds) {
    try {
      const query = `
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            title
            handle
            vendor
            productType
            tags
            templateSuffix
            status
            createdAt
            updatedAt
          }
        }
      `;

      const response = await makeGraphQLRequest(query, {
        id: `gid://shopify/Product/${productId}`,
      });

      if (response.product) {
        products.push(response.product);
      }
    } catch (error) {
      console.warn(
        `Warning: Could not fetch product ${productId}: ${error.message}`
      );
    }
  }

  return products;
}

// Get products based on filters
async function getProducts() {
  try {
    if (config.filters.productIds) {
      console.log(
        `Fetching specific products: ${config.filters.productIds.join(", ")}`
      );
      return await getProductsByIds(config.filters.productIds);
    } else {
      const { query, variables } = buildProductsQuery();

      if (variables.query) {
        console.log(`Searching products with query: "${variables.query}"`);
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

// Update product template
async function updateProductTemplate(productId, template) {
  try {
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            templateSuffix
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        id: productId,
        templateSuffix:
          template === "product" ? null : template.replace("product.", ""),
      },
    };

    const response = await makeGraphQLRequest(mutation, variables);

    if (response.productUpdate.userErrors.length > 0) {
      throw new Error(
        `Update failed: ${response.productUpdate.userErrors
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    return response.productUpdate.product;
  } catch (error) {
    throw new Error(`Failed to update product ${productId}: ${error.message}`);
  }
}

// Ask for user confirmation
function askConfirmation(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith("y"));
    });
  });
}

// Main update function
async function updateProductTemplates() {
  try {
    console.log("Starting product template update...");
    console.log(`Template to apply: ${config.template}`);

    if (config.dryRun) {
      console.log("🔍 DRY RUN MODE - No changes will be made");
    }

    // Get products to update
    const products = await getProducts();
    console.log(`\nFound ${products.length} products to process`);

    if (products.length === 0) {
      console.log("No products found matching the criteria.");
      return;
    }

    // Filter out products that already have the correct template
    const productsToUpdate = products.filter((product) => {
      const currentTemplate = product.templateSuffix
        ? `product.${product.templateSuffix}`
        : "product";
      return currentTemplate !== config.template;
    });

    console.log(
      `\nProducts that need template updates: ${productsToUpdate.length}`
    );

    if (productsToUpdate.length === 0) {
      console.log("All products already have the correct template.");
      return;
    }

    // Display products that will be updated
    console.log("\nProducts to be updated:");
    productsToUpdate.forEach((product, index) => {
      const currentTemplate = product.templateSuffix
        ? `product.${product.templateSuffix}`
        : "product";
      console.log(`${index + 1}. ${product.title} (${product.handle})`);
      console.log(`   Current: ${currentTemplate} → New: ${config.template}`);
    });

    // Ask for confirmation unless --force is used
    if (!config.force && !config.dryRun) {
      const confirmed = await askConfirmation(
        `\nDo you want to update ${productsToUpdate.length} products? (y/N): `
      );

      if (!confirmed) {
        console.log("Update cancelled.");
        return;
      }
    }

    // Update products
    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    console.log(`\n${config.dryRun ? "Simulating" : "Updating"} products...`);

    for (let i = 0; i < productsToUpdate.length; i++) {
      const product = productsToUpdate[i];
      const progress = `[${i + 1}/${productsToUpdate.length}]`;

      try {
        if (config.dryRun) {
          console.log(`${progress} ✅ Would update: ${product.title}`);
          results.success++;
        } else {
          const updatedProduct = await updateProductTemplate(
            product.id,
            config.template
          );
          console.log(`${progress} ✅ Updated: ${updatedProduct.title}`);
          results.success++;
        }
      } catch (error) {
        console.log(
          `${progress} ❌ Failed: ${product.title} - ${error.message}`
        );
        results.failed++;
        results.errors.push({
          product: product.title,
          error: error.message,
        });
      }
    }

    // Display results
    console.log(`\n📊 Update Results:`);
    console.log(`✅ Successful: ${results.success}`);
    console.log(`❌ Failed: ${results.failed}`);

    if (results.errors.length > 0) {
      console.log(`\n❌ Errors:`);
      results.errors.forEach(({ product, error }) => {
        console.log(`  • ${product}: ${error}`);
      });
    }

    if (config.dryRun) {
      console.log(
        `\n🔍 This was a dry run. To apply changes, run the command without --dry-run`
      );
    } else {
      console.log(`\n✨ Template update completed!`);
    }
  } catch (error) {
    console.error("Update failed:", error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  parseArgs();
  validateConfig();
  updateProductTemplates();
}

module.exports = {
  updateProductTemplates,
  makeGraphQLRequest,
  getProducts,
  updateProductTemplate,
};
