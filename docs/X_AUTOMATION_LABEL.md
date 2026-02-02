# X “Automated” profile label

Many bot/agent profiles on X show an **Automated** label. This is **not** something we can set per-post via the API; it’s an **account-level** setting managed in the X Developer Portal.

## What the label is (and isn’t)

- ✅ It’s a transparency label shown on the profile.
- ✅ It’s intended for accounts that primarily post via automation.
- ❌ It is **not** a request parameter when creating posts.
- ❌ It does **not** prevent X from rate-limiting or blocking suspicious automation (e.g., Playwright from cloud IPs).

## How to enable it

X’s UI changes over time, but the flow is generally:

1. Log into the **X Developer Portal**: https://developer.twitter.com/en/portal/dashboard
2. Select the project/app that you use for posting.
3. Find the **Automation / Automated account label** section.
4. Link the posting account and designate a “controller” account (a human-operated account).  
   - X often requires a **human controller** associated with the automated account.
5. Follow the portal prompts to confirm and enable the label.

If you don’t see the automation label controls:
- your app/account may not be eligible on your current API tier, or
- the feature may be in a different menu for your account.

## Recommended setup for this repo

- Prefer `SOCIAL_MODE=x_api` for reliable posting.
- Keep the label enabled for transparency.
- If you use `SOCIAL_MODE=playwright`, the label won’t “fix” X’s anti-bot checks; it mainly helps with public disclosure.

## Troubleshooting

- If Playwright posting is blocked with “looks like it might be automated”, switch to `SOCIAL_MODE=x_api` (requires API access) or post from a residential IP.
- If API posting fails due to permissions, confirm your app has write access and that your OAuth 1.0a user tokens were generated with the correct permissions.
