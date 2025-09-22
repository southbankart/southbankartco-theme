# Shopify Variants Export/Import Scripts

These scripts allow you to export product variants with metafields to CSV for editing, and then import the changes back to Shopify.

## Features

- Export all product variants with metafields to CSV
- Export specific products by ID
- Import metafield changes from edited CSV
- Dry-run mode to preview changes
- Batch processing to avoid rate limits
- Comprehensive error handling and logging
- Detailed results reporting

## Setup

1. **Install Node.js** (version 14 or higher)

2. **Set up Shopify API credentials:**
   - Go to your Shopify admin → Apps → App and sales channel settings
   - Create a private app or use an existing one with Admin API access
   - Note down your shop name and access token

3. **Set environment variables (optional):**
   ```bash
   export SHOPIFY_SHOP="your-shop-name"
   export SHOPIFY_ACCESS_TOKEN="your-access-token"
   ```

## Usage

### Export Variants

Export all variants (limited to 50 products by default):
```bash
node export-variants.js --shop your-shop-name --token your-access-token
```

Export specific product:
```bash
node export-variants.js --shop your-shop-name --token your-access-token --product-id 123456789
```

Export with custom output file:
```bash
node export-variants.js --shop your-shop-name --token your-access-token --output my-variants.csv
```

Export more products:
```bash
node export-variants.js --shop your-shop-name --token your-access-token --limit 100
```

Search for specific products:
```bash
node export-variants.js --shop your-shop-name --token your-access-token --search "nielsen"
```

Search with custom output:
```bash
node export-variants.js --shop your-shop-name --token your-access-token --search "frames" --output nielsen-frames.csv
```

### Import Variants

Import from CSV (dry run first):
```bash
node import-variants.js --shop your-shop-name --token your-access-token --input variants-export.csv --dry-run
```

Apply changes:
```bash
node import-variants.js --shop your-shop-name --token your-access-token --input variants-export.csv
```

Import with custom batch size:
```bash
node import-variants.js --shop your-shop-name --token your-access-token --input variants-export.csv --batch-size 5
```

## CSV Format

The exported CSV includes:

### Standard Variant Fields
- `product_id` - Shopify product ID
- `product_title` - Product title
- `product_handle` - Product handle
- `variant_id` - Shopify variant ID
- `variant_title` - Variant title
- `variant_sku` - SKU
- `variant_barcode` - Barcode
- `variant_price` - Price
- `variant_compare_at_price` - Compare at price
- `variant_cost_price` - Cost price
- `variant_weight` - Weight
- `variant_weight_unit` - Weight unit
- `variant_inventory_quantity` - Inventory quantity
- `variant_inventory_management` - Inventory management
- `variant_inventory_policy` - Inventory policy
- `variant_fulfillment_service` - Fulfillment service
- `variant_requires_shipping` - Requires shipping
- `variant_taxable` - Taxable
- `variant_option1` - Option 1 value
- `variant_option2` - Option 2 value
- `variant_option3` - Option 3 value
- `variant_created_at` - Created date
- `variant_updated_at` - Updated date

### Metafield Fields
Metafields are exported as `metafield_{namespace}_{key}` columns. For example:
- `metafield_custom_popular` - Custom popular flag
- `metafield_custom_nielsen_variant_subtitle` - Nielsen variant subtitle

## Editing the CSV

1. Open the exported CSV in Excel, Google Sheets, or any CSV editor
2. Edit the metafield columns as needed
3. **Important:** Do not modify the `variant_id` or `product_id` columns
4. Save the file

## Common Metafield Types

Based on your theme, you're using these metafields:
- `custom.popular` - Boolean flag for popular variants
- `custom.nielsen_variant_subtitle` - Subtitle text for Nielsen frames

## Error Handling

The scripts include comprehensive error handling:
- API rate limiting protection
- Invalid data validation
- Detailed error reporting
- Rollback capability (dry-run mode)

## Rate Limiting

Shopify has API rate limits. The import script:
- Processes variants in batches (default: 10)
- Adds delays between batches
- Handles rate limit errors gracefully

## Troubleshooting

### Common Issues

1. **Authentication Error**
   - Verify your shop name and access token
   - Ensure the app has Admin API access

2. **Rate Limiting**
   - Reduce batch size: `--batch-size 5`
   - The script will automatically retry

3. **CSV Format Issues**
   - Ensure CSV is properly formatted
   - Don't modify ID columns
   - Use proper escaping for special characters

4. **Metafield Not Found**
   - Check metafield namespace and key names
   - Ensure metafields exist in your Shopify admin

### Getting Help

Run with `--help` for detailed usage information:
```bash
node export-variants.js --help
node import-variants.js --help
```

## Security Notes

- Never commit access tokens to version control
- Use environment variables for credentials
- Consider using Shopify CLI for development

## Example Workflow

1. Export variants (search for specific products):
   ```bash
   node export-variants.js --shop my-shop --token my-token --search "nielsen" --output nielsen-variants.csv
   ```

2. Edit the CSV file to update metafields

3. Preview changes:
   ```bash
   node import-variants.js --shop my-shop --token my-token --input variants.csv --dry-run
   ```

4. Apply changes:
   ```bash
   node import-variants.js --shop my-shop --token my-token --input variants.csv
   ```

5. Check the results file for any errors or issues
