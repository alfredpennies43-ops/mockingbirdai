{
  const cfg = window.MOCKINGBIRD || {};
  document.querySelectorAll("[data-price]").forEach((el) => (el.textContent = cfg.price || el.textContent));
  const ready = cfg.paddleClientToken && cfg.paddlePriceId && window.Paddle;
  if (ready) {
    if (cfg.paddleEnv === "sandbox") Paddle.Environment.set("sandbox");
    Paddle.Initialize({ token: cfg.paddleClientToken });
  }
  const note = document.getElementById("buy-note");
  document.querySelectorAll("[data-buy]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ready) {
        if (note) note.textContent = "Checkout opens soon. In the meantime, download the free trial.";
        return;
      }
      Paddle.Checkout.open({
        items: [{ priceId: cfg.paddlePriceId, quantity: 1 }],
        settings: { successUrl: location.origin + "/thanks", displayMode: "overlay", theme: "dark" },
      });
    })
  );
}
