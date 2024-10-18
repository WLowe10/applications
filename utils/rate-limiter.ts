export class RateLimiter {
	private isWaiting: boolean = false;

	async wait() {
		if (this.isWaiting) {
			return;
		}
		this.isWaiting = true;
		console.log("Rate limit hit. Waiting for 1 minute...");
		await new Promise((resolve) => setTimeout(resolve, 60000));
		this.isWaiting = false;
	}

	async execute<T>(fn: () => Promise<T>): Promise<T | null> {
		while (true) {
			try {
				return await fn();
			} catch (error) {
				//@ts-ignore
				if (error.message.includes("rate limit")) {
					//@ts-ignore
					console.log(error.message);
					await this.wait();
				} else {
					console.log(error);
					return null;
				}
			}
		}
	}
}
