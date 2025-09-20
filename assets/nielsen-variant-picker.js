class NielsenVariantPicker {
  constructor(container) {
    this.container = container;
    this.sectionId =
      container.dataset.section ||
      container.closest("[data-section]")?.dataset.section ||
      document.querySelector("[data-section]")?.dataset.section;
    this.sizeButtons = container.querySelectorAll(".nielsen-size-btn");
    this.selectedVariant =
      container.querySelector(`#nielsen-selected-variant-${this.sectionId}`) ||
      container.querySelector(".nielsen-selected-variant");
    this.selectedTitle =
      container.querySelector(`#nielsen-selected-title-${this.sectionId}`) ||
      container.querySelector(".nielsen-selected-title");
    this.selectedDetails =
      container.querySelector(`#nielsen-selected-details-${this.sectionId}`) ||
      container.querySelector(".nielsen-selected-details");

    // Get variants data from the variant-selects element
    const variantSelects = container.querySelector("variant-selects");
    this.variantsData = variantSelects
      ? JSON.parse(variantSelects.querySelector("script").textContent)
      : [];

    // Find the product form
    this.productForm =
      document.querySelector(`#product-form-${this.sectionId}`) ||
      document.querySelector('form[action*="/cart/add"]');

    console.log("Product form found:", {
      sectionId: this.sectionId,
      productForm: !!this.productForm,
      formId: this.productForm?.id,
      loadingSpinner: this.productForm?.querySelector(".loading__spinner"),
    });

    this.init();
  }

  init() {
    console.log("Nielsen Variant Picker initialized", {
      sectionId: this.sectionId,
      variantsCount: this.variantsData.length,
      buttonsCount: this.sizeButtons.length,
      productForm: !!this.productForm,
      selectedVariant: !!this.selectedVariant,
      selectedTitle: !!this.selectedTitle,
      selectedDetails: !!this.selectedDetails,
      containerDataset: this.container.dataset,
      closestSection: this.container.closest("[data-section]")?.dataset.section,
    });

    this.bindEvents();
    this.updateDisplay();
  }

  bindEvents() {
    this.sizeButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        this.selectVariant(button);
      });
    });
  }

  selectVariant(button) {
    console.log("Selecting variant", button.dataset.variantId);

    // Remove selected class from all buttons
    this.sizeButtons.forEach((btn) =>
      btn.classList.remove("nielsen-size-btn--selected")
    );

    // Add selected class to clicked button
    button.classList.add("nielsen-size-btn--selected");

    // Get variant data
    const variantId = parseInt(button.dataset.variantId);
    const variant = this.variantsData.find((v) => v.id === variantId);

    console.log("Found variant", variant);

    if (!variant) {
      console.error("Variant not found for ID:", variantId);
      return;
    }

    // Update selected variant display
    this.updateSelectedVariantDisplay(variant, button);

    // Update hidden form inputs for Shopify
    this.updateFormInputs(variant);

    // Trigger variant change event for other scripts
    this.triggerVariantChange(variant);
  }

  updateSelectedVariantDisplay(variant, button) {
    console.log("Updating selected variant display", {
      selectedVariant: !!this.selectedVariant,
      selectedTitle: !!this.selectedTitle,
      selectedDetails: !!this.selectedDetails,
    });

    const sizeName = button.querySelector(".nielsen-size-name").textContent;
    const dimensions =
      button.querySelector(".nielsen-size-details")?.textContent || "";
    const price = this.formatPrice(variant.price);

    if (this.selectedTitle) {
      this.selectedTitle.textContent = `${sizeName}${
        dimensions ? ` (${dimensions})` : ""
      } - ${price}`;
    }

    // Generate use case based on size
    let useCase = this.getUseCase(sizeName);

    // Generate Nielsen code (you can customize this logic)
    const nielsenCode = this.generateNielsenCode(variant, sizeName);

    // Determine availability text
    const availabilityText = this.getAvailabilityText(variant);

    if (this.selectedDetails) {
      this.selectedDetails.innerHTML = `
        <strong>Nielsen Code:</strong> <span class="nielsen-code">${nielsenCode}</span><br>
        <strong>Best for:</strong> ${useCase}<br>
        <strong>Availability:</strong> ${availabilityText}
      `;
    }

    if (this.selectedVariant) {
      this.selectedVariant.style.display = "block";
    }
  }

  updateFormInputs(variant) {
    if (!this.productForm) return;

    // Update hidden variant ID input
    let variantInput = this.productForm.querySelector('input[name="id"]');
    if (!variantInput) {
      variantInput = document.createElement("input");
      variantInput.type = "hidden";
      variantInput.name = "id";
      this.productForm.appendChild(variantInput);
    }
    variantInput.value = variant.id;

    // Update option inputs - remove existing option inputs first
    const existingOptionInputs = this.productForm.querySelectorAll(
      'input[name^="options["]'
    );
    existingOptionInputs.forEach((input) => input.remove());

    // Add new option inputs
    variant.options.forEach((option, index) => {
      const optionInput = document.createElement("input");
      optionInput.type = "hidden";
      optionInput.name = `options[${this.getOptionName(index)}]`;
      optionInput.value = option;
      this.productForm.appendChild(optionInput);
    });

    // Trigger Shopify's variant change event
    this.triggerShopifyVariantChange(variant);
  }

  triggerVariantChange(variant) {
    // Dispatch custom event for other scripts to listen to
    const event = new CustomEvent("nielsen:variant:change", {
      detail: { variant: variant },
    });
    document.dispatchEvent(event);
  }

  triggerShopifyVariantChange(variant) {
    // Trigger Shopify's variant change event with proper data structure
    const variantChangeEvent = new CustomEvent("variant:change", {
      detail: {
        variant: variant,
        sectionId: this.sectionId,
      },
    });
    document.dispatchEvent(variantChangeEvent);

    // Also trigger the standard Shopify variant change
    if (window.Shopify && window.Shopify.onVariantChange) {
      window.Shopify.onVariantChange(variant);
    }

    // Trigger the theme's pub/sub system for price updates
    if (window.PUB_SUB_EVENTS) {
      window.PUB_SUB_EVENTS.publish("variantChange", {
        data: { variant: variant },
      });
    }

    // Manually update price element if it exists
    this.updatePriceElement(variant);

    // Update add-to-cart button state
    this.updateAddToCartButton(variant);
  }

  updatePriceElement(variant) {
    const priceElement = document.getElementById(`price-${this.sectionId}`);
    console.log("Updating price element", {
      priceElementId: `price-${this.sectionId}`,
      priceElement: !!priceElement,
      variant: variant,
      formattedPrice: variant ? this.formatPrice(variant.price) : null,
    });

    if (priceElement && variant) {
      // Format the price
      const formattedPrice = this.formatPrice(variant.price);
      const formattedComparePrice = variant.compare_at_price
        ? this.formatPrice(variant.compare_at_price)
        : null;

      // Update regular price (most common case)
      const regularPriceSpan = priceElement.querySelector(
        ".price__regular .price-item--regular"
      );
      if (regularPriceSpan) {
        regularPriceSpan.textContent = formattedPrice;
        console.log("Updated regular price span:", formattedPrice);
      }

      // Handle sale price if compare_at_price exists and is higher
      if (
        variant.compare_at_price &&
        variant.compare_at_price > variant.price
      ) {
        const salePriceSpan = priceElement.querySelector(
          ".price__sale .price-item--sale"
        );
        const saleRegularSpan = priceElement.querySelector(
          ".price__sale .price-item--regular"
        );

        if (salePriceSpan) {
          salePriceSpan.textContent = formattedPrice;
          console.log("Updated sale price span:", formattedPrice);
        }
        if (saleRegularSpan) {
          saleRegularSpan.textContent = formattedComparePrice;
          console.log(
            "Updated sale regular price span:",
            formattedComparePrice
          );
        }
      }

      // Also try to update any other price spans that might exist
      const allPriceSpans = priceElement.querySelectorAll(".price-item");
      allPriceSpans.forEach((span) => {
        if (
          span.classList.contains("price-item--regular") &&
          !span.closest(".price__sale")
        ) {
          span.textContent = formattedPrice;
        } else if (span.classList.contains("price-item--sale")) {
          span.textContent = formattedPrice;
        }
      });
    }
  }

  updateAddToCartButton(variant) {
    // Find the add-to-cart button
    const addToCartButton =
      this.productForm?.querySelector('[name="add"]') ||
      document.querySelector(`#product-form-${this.sectionId} [name="add"]`) ||
      document.querySelector('.product-form__buttons [name="add"]');

    console.log("Updating add-to-cart button", {
      addToCartButton: !!addToCartButton,
      variant: variant,
      available: variant?.available,
    });

    if (addToCartButton && variant) {
      // Store original text if not already stored
      if (!addToCartButton.dataset.originalText) {
        addToCartButton.dataset.originalText = addToCartButton.textContent;
      }

      // Update button text and state based on variant availability
      if (variant.available) {
        addToCartButton.disabled = false;
        addToCartButton.textContent =
          addToCartButton.dataset.originalText || "Add to cart";
        addToCartButton.classList.remove("sold-out");
        console.log("Button enabled:", addToCartButton.textContent);
      } else {
        addToCartButton.disabled = true;
        addToCartButton.textContent = "Sold out";
        addToCartButton.classList.add("sold-out");
        console.log("Button disabled: Sold out");
      }
    }
  }

  updateDisplay() {
    // Initialize with first available variant if none selected
    const selectedButton = this.container.querySelector(
      ".nielsen-size-btn--selected"
    );
    if (!selectedButton && this.sizeButtons.length > 0) {
      const firstAvailable = Array.from(this.sizeButtons).find(
        (btn) => !btn.disabled
      );
      if (firstAvailable) {
        this.selectVariant(firstAvailable);
      }
    } else if (selectedButton) {
      // If there's already a selected button, update the display
      this.selectVariant(selectedButton);
    }
  }

  // Helper methods
  formatPrice(price) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(price / 100);
  }

  getUseCase(sizeName) {
    const size = sizeName.toLowerCase();
    if (size.includes("a4") || size.includes("8x10")) {
      return "Perfect for certificates, small photos, documents";
    } else if (size.includes("a3") || size.includes("11x14")) {
      return "Perfect for photography, artwork, medium prints";
    } else {
      return "Perfect for large artwork, gallery displays";
    }
  }

  generateNielsenCode(variant, sizeName) {
    // This is a simplified version - you can customize based on your product structure
    const productTitle =
      document.querySelector(".product__title")?.textContent || "NIELSEN";
    const size = sizeName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return `${productTitle.split(" ")[0]}-${size}-${variant.id}`;
  }

  getAvailabilityText(variant) {
    if (variant.available) {
      if (variant.inventory_quantity > 10) {
        return "Ready for collection today from SE1 workshop";
      } else {
        return "Fast order - ready in 2-3 days (backorder)";
      }
    } else {
      return "Currently out of stock - contact us for availability";
    }
  }

  getOptionName(index) {
    // This should match your product's option names
    const optionNames = ["Size", "Color", "Style"]; // Customize as needed
    return optionNames[index] || `Option ${index + 1}`;
  }
}

// Initialize Nielsen variant pickers when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
  const nielsenPickers = document.querySelectorAll(".nielsen-rich-picker");
  nielsenPickers.forEach((picker) => {
    new NielsenVariantPicker(picker);
  });
});

// Re-initialize when new content is loaded (for dynamic themes)
document.addEventListener("shopify:section:load", function (event) {
  const nielsenPickers = event.target.querySelectorAll(".nielsen-rich-picker");
  nielsenPickers.forEach((picker) => {
    new NielsenVariantPicker(picker);
  });
});
