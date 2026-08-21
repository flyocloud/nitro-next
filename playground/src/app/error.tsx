'use client'

// The other half of `not-found.tsx`: what a *failure* looks like.
//
// The Flyo route helpers only turn a CMS **404** into `notFound()`. Every other
// failure — a 401 from a wrong access token, a 500, an unreachable API — is
// rethrown and lands here, so an outage is visible instead of being answered
// with a soft 404 on every URL of the site (which is how search engines are
// told to de-index content that is merely unreachable). See the README's
// "Not found vs. error" section.
function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
	return (
		<div>
			<h1>Something went wrong</h1>
			<p>The content could not be loaded. This is a server error, not a missing page.</p>
			<button onClick={reset}>Try again</button>
		</div>
	)
}

export default ErrorPage
