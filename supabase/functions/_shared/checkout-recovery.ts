/** Release an intent only after Paddle confirms that its transaction is canceled. */
export async function cancelVerifiedCheckout(
  status: string,
  cancelAtPaddle: () => Promise<unknown>,
  readStatus: () => Promise<string>,
  closeIntent: () => Promise<unknown>,
): Promise<'canceled' | 'not_cancellable'> {
  if (status === 'canceled') {
    await closeIntent();
    return 'canceled';
  }
  // FAQify creates automatic, API-origin pack transactions. Paddle supports
  // canceling these only while draft or ready; paid/completed are immutable.
  if (status !== 'draft' && status !== 'ready') return 'not_cancellable';
  await cancelAtPaddle();
  if (await readStatus() !== 'canceled') throw new Error('Cancellation could not be confirmed');
  await closeIntent();
  return 'canceled';
}
