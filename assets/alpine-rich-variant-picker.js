// Alpine.js Rich Variant Picker
document.addEventListener("alpine:init", () => {
  Alpine.data("richVariantPicker", () => ({
    product: null,
    selectedOptions: {},
    options: [],

    init() {
      this.loadProductData();
      this.initializeOptions();
      this.initializeSelection();
    },

    loadProductData() {
      const variantSelects = document.querySelector("variant-selects");
      if (variantSelects) {
        const productData = variantSelects.querySelector(
          '[type="application/json"]'
        );
        if (productData) {
          try {
            const parsedData = JSON.parse(productData.textContent);
            this.product = Array.isArray(parsedData)
              ? { variants: parsedData }
              : parsedData;
          } catch (error) {
            console.error(
              "RichVariantPicker: Error parsing product data:",
              error
            );
          }
        }
      }
    },

    initializeOptions() {
      if (!this.product) return;

      // Get options from the DOM
      const fieldsets = document.querySelectorAll(".rich-variant-fieldset");
      this.options = Array.from(fieldsets).map((fieldset, index) => {
        const optionName = fieldset.dataset.option;
        const inputs = fieldset.querySelectorAll('input[type="radio"]');
        const values = Array.from(inputs).map((input) => ({
          value: input.value,
          label: input.value,
          input: input,
        }));

        return {
          name: optionName,
          position: index + 1,
          values: values,
        };
      });
    },

    initializeSelection() {
      // Get current selected options from form inputs
      const fieldsets = document.querySelectorAll(".rich-variant-fieldset");
      const currentOptions = {};

      fieldsets.forEach((fieldset, index) => {
        const checkedInput = fieldset.querySelector("input:checked");
        if (checkedInput) {
          currentOptions[`option${index + 1}`] = checkedInput.value;
        }
      });

      if (Object.keys(currentOptions).length > 0) {
        this.selectedOptions = currentOptions;
      } else {
        // Fallback: use first available variant
        const firstVariant = this.product?.variants?.find((v) => v.available);
        if (firstVariant) {
          this.selectedOptions = {
            option1: firstVariant.option1,
            option2: firstVariant.option2,
            option3: firstVariant.option3,
          };
        }
      }
    },

    selectOption(optionName, value) {
      // Map option name to position
      const optionPosition = this.options.find(
        (opt) => opt.name === optionName
      )?.position;
      if (optionPosition) {
        this.selectedOptions[`option${optionPosition}`] = value;
      }
    },

    getPriceDisplay(optionName, value) {
      if (!this.product) return "";

      const option = this.options.find((opt) => opt.name === optionName);
      if (!option) return "";

      if (option.position === 1) {
        // First level: show actual variant price
        const variant = this.product.variants.find((v) => v.option1 === value);
        return variant ? this.formatMoney(variant.price) : "";
      } else {
        // Subsequent levels: show price difference from current selection
        const isCurrentlySelected = this.isSelected(optionName, value);

        if (isCurrentlySelected) {
          // For selected option, show "Selected"
          return "Selected";
        } else {
          // For unselected options, show price difference from current selection
          const referenceVariant = this.findReferenceVariant(option.position);
          const variant = this.findVariantWithOptions(option.position, value);

          if (variant && referenceVariant) {
            const priceDifference = variant.price - referenceVariant.price;
            if (priceDifference > 0) {
              return "+ " + this.formatMoney(priceDifference);
            } else if (priceDifference < 0) {
              const diff = Math.abs(priceDifference);
              return "- " + this.formatMoney(diff);
            } else {
              return "£0.00";
            }
          }
        }
      }

      return "";
    },

    findReferenceVariant(optionPosition) {
      if (!this.product) return null;

      // Find the variant that matches ALL currently selected options
      return this.product.variants.find((variant) => {
        // Check all selected options match
        if (
          this.selectedOptions.option1 &&
          variant.option1 !== this.selectedOptions.option1
        )
          return false;
        if (
          this.selectedOptions.option2 &&
          variant.option2 !== this.selectedOptions.option2
        )
          return false;
        if (
          this.selectedOptions.option3 &&
          variant.option3 !== this.selectedOptions.option3
        )
          return false;

        return true;
      });
    },

    findVariantWithOptions(optionPosition, value) {
      if (!this.product) return null;

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
    },

    formatMoney(cents) {
      const amount = (cents / 100).toFixed(2);
      return "£" + amount;
    },

    isSelected(optionName, value) {
      const option = this.options.find((opt) => opt.name === optionName);
      if (!option) return false;

      return this.selectedOptions[`option${option.position}`] === value;
    },
  }));
});
