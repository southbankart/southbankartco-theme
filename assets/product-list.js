$(() => {
  $('form.variant-list-item').each((i, el) => {
    new window.AjaxCart($(el));
  });
});
