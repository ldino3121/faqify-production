// Both historical webhook URLs now use the same implementation. This avoids
// conflicting quota resets and late events overwriting a replacement plan.
import '../razorpay-webhook/index.ts';
