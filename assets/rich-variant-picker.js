class RichVariantPicker {
  constructor() {
    this.product = null;
    this.selectedOptions = {};
    this.init();
  }

  init() {
    // Get product data from variant-selects element
    const variantSelects = document.querySelector("variant-selects");
    if (variantSelects) {
      const productData = variantSelects.querySelector(
        '[type="application/json"]'
      );
      if (productData) {
        try {
          const parsedData = JSON.parse(productData.textContent);

          // Handle both array of variants and product object with variants property
          if (Array.isArray(parsedData)) {
            // Data is an array of variants
            this.product = { variants: parsedData };
          } else if (parsedData.variants) {
            // Data is a product object with variants
            this.product = parsedData;
          }
        } catch (error) {
          console.error(
            "RichVariantPicker: Error parsing product data:",
            error
          );
        }
      }
    }

    // Check if product data was loaded
    if (!this.product || !this.product.variants) {
      return;
    }

    // Listen for variant changes
    document.addEventListener("variant:change", (event) => {
      this.updatePrices(event.detail.variant);
    });

    // Listen for option changes
    document.addEventListener("change", (event) => {
      if (event.target.closest(".rich-variant-fieldset")) {
        this.handleOptionChange(event.target);
      }
    });

    // Initialize with current selection
    this.initializeWithCurrentSelection();
  }

  initializeWithCurrentSelection() {
    // Get current selected options from the form inputs
    const fieldsets = document.querySelectorAll(".rich-variant-fieldset");
    const currentOptions = {};

    fieldsets.forEach((fieldset, index) => {
      const optionName = fieldset.dataset.option;
      const checkedInput = fieldset.querySelector("input:checked");

      if (optionName && checkedInput) {
        currentOptions[`option${index + 1}`] = checkedInput.value;
      }
    });

    // If we have selected options, use them
    if (Object.keys(currentOptions).length > 0) {
      this.selectedOptions = currentOptions;
      this.updateAllPrices();
    } else {
      // Fallback: try to get current variant from hidden input
      const currentVariant = document.querySelector('[name="id"]:checked');
      if (currentVariant && this.product) {
        const variant = this.product.variants.find(
          (v) => v.id == currentVariant.value
        );
        if (variant) {
          this.updatePrices(variant);
        }
      } else if (this.product) {
        // Last resort: use first available variant
        const firstVariant = this.product.variants.find((v) => v.available);
        if (firstVariant) {
          this.updatePrices(firstVariant);
        } else {
          this.updatePrices(this.product.variants[0]);
        }
      }
    }
  }

  handleOptionChange(input) {
    const fieldset = input.closest(".rich-variant-fieldset");
    const optionName = fieldset.dataset.option;
    const optionValue = input.value;

    // Map option names to positions (option1, option2, option3)
    const optionPositionMap = {};
    const fieldsets = document.querySelectorAll(".rich-variant-fieldset");
    fieldsets.forEach((fs, index) => {
      const name = fs.dataset.option;
      if (name) {
        optionPositionMap[name] = `option${index + 1}`;
      }
    });

    // Update selected options using the correct position
    if (optionPositionMap[optionName]) {
      this.selectedOptions[optionPositionMap[optionName]] = optionValue;
    }

    // Update prices for subsequent options
    this.updateAllPrices();
  }

  updatePrices(currentVariant) {
    if (!currentVariant || !this.product) return;

    // Update selected options from current variant
    this.selectedOptions = {
      option1: currentVariant.option1,
      option2: currentVariant.option2,
      option3: currentVariant.option3,
    };

    this.updateAllPrices();
  }

  updateAllPrices() {
    if (!this.product || !this.product.variants) {
      return;
    }

    const optionFieldsets = document.querySelectorAll(".rich-variant-fieldset");

    optionFieldsets.forEach((fieldset, index) => {
      const optionPosition = index + 1;
      const optionName = fieldset.dataset.option;

      if (optionPosition === 1) {
        // First level: show actual variant prices
        this.updateFirstLevelPrices(fieldset);
      } else {
        // Subsequent levels: show price differences
        this.updateSubsequentLevelPrices(fieldset, optionPosition);
      }
    });
  }

  updateFirstLevelPrices(fieldset) {
    const buttons = fieldset.querySelectorAll(".rich-variant-btn");

    buttons.forEach((button) => {
      const inputId = button.getAttribute("for");
      const input = document.getElementById(inputId);
      if (!input) return;

      const value = input.value;
      const priceElement = button.querySelector(".rich-variant-price");

      if (priceElement) {
        // Find variant with this option1 value
        const variant = this.product.variants.find((v) => v.option1 === value);
        if (variant) {
          priceElement.textContent = this.formatMoney(variant.price);
        }
      }
    });
  }

  updateSubsequentLevelPrices(fieldset, optionPosition) {
    const buttons = fieldset.querySelectorAll(".rich-variant-btn");

    // Find reference variant (with selected parent options)
    const referenceVariant = this.findReferenceVariant(optionPosition);
    const referencePrice = referenceVariant ? referenceVariant.price : 0;

    buttons.forEach((button) => {
      const inputId = button.getAttribute("for");
      const input = document.getElementById(inputId);
      if (!input) return;

      const value = input.value;
      const priceElement = button.querySelector(".rich-variant-price");

      if (priceElement) {
        // Find variant with this option value and same parent options
        const variant = this.findVariantWithOptions(optionPosition, value);

        if (variant) {
          if (referenceVariant) {
            // Show price difference from reference
            const priceDifference = variant.price - referencePrice;

            if (priceDifference > 0) {
              priceElement.textContent =
                "+" + this.formatMoney(priceDifference);
            } else if (priceDifference < 0) {
              priceElement.textContent = this.formatMoney(priceDifference);
            } else {
              priceElement.textContent = "No change";
            }
          } else {
            // No reference variant, show actual price
            priceElement.textContent = this.formatMoney(variant.price);
          }
        } else {
          priceElement.textContent = "Loading...";
        }
      }
    });
  }

  findReferenceVariant(optionPosition) {
    // Find variant that matches all selected parent options
    return this.product.variants.find((variant) => {
      if (optionPosition > 1 && this.selectedOptions.option1) {
        if (variant.option1 !== this.selectedOptions.option1) return false;
      }
      if (optionPosition > 2 && this.selectedOptions.option2) {
        if (variant.option2 !== this.selectedOptions.option2) return false;
      }
      return true;
    });
  }

  findVariantWithOptions(optionPosition, value) {
    return this.product.variants.find((variant) => {
      // Check parent options match
      if (optionPosition > 1 && this.selectedOptions.option1) {
        if (variant.option1 !== this.selectedOptions.option1) return false;
      }
      if (optionPosition > 2 && this.selectedOptions.option2) {
        if (variant.option2 !== this.selectedOptions.option2) return false;
      }

      // Check current option matches
      if (optionPosition === 1 && variant.option1 === value) return true;
      if (optionPosition === 2 && variant.option2 === value) return true;
      if (optionPosition === 3 && variant.option3 === value) return true;

      return false;
    });
  }

  formatMoney(cents) {
    // Convert cents to formatted money string
    const amount = (cents / 100).toFixed(2);
    return "£" + amount;
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Delay to ensure Shopify variant-selects has initialized
  setTimeout(() => {
    new RichVariantPicker();
  }, 500);
});
