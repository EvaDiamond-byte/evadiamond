# EvaDiamond BioIntel — Payments

The launch page includes four plan tiers:
- Explorer: ₦0/month
- Researcher: ₦4,500/month
- Professional: ₦9,500/month
- Enterprise: Custom

These prices are placeholders. Do not accept real payments until you configure a payment processor.

## Recommended Nigeria-first options

Use a payment provider such as Paystack or Flutterwave. Create the plans/products in the provider dashboard, then connect checkout creation and payment verification in a Netlify Function.

Required production flow:
1. User chooses a plan.
2. Browser calls a Netlify Function such as `create-checkout`.
3. Function creates a checkout session using the provider secret key.
4. User completes payment on the provider's hosted checkout.
5. Provider webhook calls your Netlify Function.
6. Function verifies the transaction and activates the subscription.
7. Store subscription status in a database.

Never place payment secret keys in HTML or `chat.mjs`.

## Before launch
- Replace placeholder prices with your actual prices.
- Add Terms of Service and Privacy Policy.
- Add refund/cancellation policy.
- Configure webhook verification.
- Add rate limiting.
- Add user authentication if paid accounts are enabled.
