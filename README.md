# Skillora Foundation

Build the foundation of a premium, modern EdTech platform called Skillora.

Tagline: Learn. Grow. Earn.

Skillora will be an EdTech platform where users can purchase learning packages, access courses, watch videos, study materials, complete quizzes, earn certificates, and later activate Affiliate Mode from the same account.

IMPORTANT

This is PHASE 1 ONLY.

Do not build payment, commission, wallet, withdrawal, refund, or complete affiliate logic yet. We will build those in later phases.

1. PROFESSIONAL UI/UX

Create a premium, production-quality EdTech SaaS design.

The UI must NOT look like a basic AI-generated template.

Use:

Modern professional typography

Clean spacing

Premium cards

Subtle shadows

Clean borders

Professional icons

Smooth micro-interactions

Clear CTA buttons

Excellent visual hierarchy

Responsive design

Mobile-first layouts

Consistent design system

Avoid:

Excessive gradients

Excessive animations

Clutter

Random colors

Inconsistent components

Generic dashboard UI

Use one consistent Skillora design system across the entire application.

2. BRAND

Brand name: Skillora

Tagline: Learn. Grow. Earn.

Create a simple premium logo/text treatment if no logo is provided.

Create reusable design tokens for:

Primary color

Secondary color

Background

Surface

Text

Muted text

Border

Success

Warning

Error

Make the color system easy to change later.

3. PUBLIC WEBSITE

Create these pages:

Home

Include:

Hero section

Skillora introduction

Popular Packages

Featured Courses

Why Skillora

How It Works

Learning Benefits

Affiliate introduction

FAQ

CTA

Footer

Hero:

Learn Skills. Build Your Career. Grow With Skillora.

Buttons:

Explore Packages
Start Learning

Do not use fake real-world statistics or fake testimonials.

Packages

Create professional package cards showing:

Package name

Description

Original price

Selling price

Discount

Course count

Features

View Package button

Package Details

Show:

Package title

Description

Pricing

Features

Courses included

FAQ

Buy Now button

Payment will be implemented later.

Courses

Create:

Search

Category filter

Course cards

Thumbnail

Course title

Instructor

Duration

Level

View Course

Course Details

Show:

Course title

Thumbnail/video placeholder

Description

Features

Curriculum preview

Instructor

FAQ

Enroll button

About

Professional About page.

Contact

Professional contact form.

4. AUTHENTICATION UI

Create:

Login

Email/Mobile

Password

Login

Forgot Password

Create Account

Register

Full Name

Email

Mobile

Password

Confirm Password

Keep authentication structure ready for future Supabase integration.

5. STUDENT DASHBOARD UI

Create a professional dashboard layout.

Sidebar:

Dashboard

My Learning

My Packages

My Courses

Certificates

Orders

Notifications

Affiliate

Profile

Logout

Dashboard should have:

Welcome section

Continue Learning

Course progress cards

My Packages

Recent activity

Certificates

Use realistic placeholder data only for UI demonstration.

6. AFFILIATE DASHBOARD UI

Create the Affiliate dashboard shell.

Sidebar:

Dashboard

Promo Code

Referral Link

Clicks

Leads

Sales

Commission

Wallet

Withdrawals

Profile

Show placeholder cards for:

Total Sales

Total Revenue

Commission

Pending Commission

Available Balance

The actual affiliate functionality will be added later.

7. ADMIN DASHBOARD UI

Create a professional SaaS-style Admin Panel.

Sidebar:

Dashboard

Students

Affiliates

Packages

Courses

Orders

Payments

Refunds

Promo Codes

Commissions

Wallets

Withdrawals

Certificates

Notifications

Reports

Settings

Dashboard cards:

Total Students

Total Affiliates

Total Packages

Total Courses

Orders

Revenue

Pending Commission

Use charts/placeholders for future analytics.

8. DATABASE FOUNDATION

Prepare the project architecture for Supabase/PostgreSQL.

Plan these main entities:

Users:

users

user_roles

Education:

packages

package_courses

package_inclusions

courses

course_sections

lessons

lesson_resources

quizzes

Purchase:

orders

order_items

payments

enrollments

lesson_progress

Affiliate:

affiliate_profiles

affiliate_clicks

affiliate_leads

promo_codes

promo_code_usage

affiliate_commissions

affiliate_wallet

wallet_transactions

affiliate_payouts

Other:

certificates

notifications

refunds

audit_logs

Create clean relationships and scalable architecture.

9. USER ROLES

Support:

Student

Affiliate

Admin

IMPORTANT:

A single user account can have both:

Student + Affiliate

Do NOT create separate accounts for Student and Affiliate.

Admin must have protected access.

10. RESPONSIVE DESIGN

The entire application must work professionally on:

Desktop

Laptop

Tablet

Mobile

Use mobile navigation/hamburger menu where required.

Make tables and dashboard components responsive.

11. REUSABLE COMPONENTS

Create reusable components for:

Buttons

Cards

Forms

Inputs

Modals

Tables

Tabs

Dropdowns

Search

Filters

Pagination

Toasts

Progress bars

Charts

Loading states

Empty states

Error states

All components must follow the same Skillora design system.

12. DEVELOPMENT RULES

Keep the code modular and scalable.

Do not duplicate components unnecessarily.

Do not break existing functionality in future phases.

Reuse the Skillora design system in all future modules.

Keep financial logic server-side when implemented later.

Keep Admin, Student and Affiliate permissions separate.

Do not expose private course videos publicly.

Do not use fake production statistics.

Keep the UI production-quality.

PHASE 1 OUTPUT

At the end of this phase, Skillora should have:

Premium Public Website + Packages UI + Courses UI + Login/Register UI + Student Dashboard Shell + Affiliate Dashboard Shell + Admin Dashboard Shell + Scalable Database Architecture.

Make the final result look like a real premium EdTech SaaS product, not a basic prototype.

Do not implement the complete payment, commission, wallet, affiliate tracking, refund, or withdrawal system in this phase.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://aiinstitutesatana2.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ff7bd6a4-75eb-4b34-b781-0a64201cad50).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Course video uploads

Course lesson uploads use the private Supabase Storage bucket `course-videos`.
The included migration creates the bucket with MP4/WebM MIME restrictions and a
50 MiB per-file limit, and adds admin-only upload plus paid-package playback
policies. Apply the new Supabase migrations before using lesson uploads.

The client-side size limit defaults to 50 MiB. Set
`VITE_COURSE_VIDEO_MAX_SIZE_MIB` to a lower value to enforce a smaller app
limit. To raise the default, update that variable, the bucket's
`file_size_limit`, and the matching minimum-size check in
`supabase/migrations/20261021193000_course_video_storage.sql`. Confirm that the
Supabase project's plan and configured Storage limits permit the selected
value before applying the migration. Keep the bucket private; playback uses
short-lived signed URLs. Uploads use resumable Tus transfers and store only the
Storage path in the lesson record.

## Affiliate commissions

Per-package affiliate commission settings support percentage and fixed INR
amounts. The commission-settings migration in
`supabase/migrations/20261104190000_affiliate_commission_settings.sql` is
prepared but intentionally unapplied; review and approve it before deployment.
It extends the existing package and commission tables and does not alter promo
code records.

The configured demo-payment flow can display a server-calculated commission
estimate for testing, but demo payments never create commission records or
grant course access. The migration allocates verified order payments across
all order items, creates at most one commission per package item, caps fixed
commissions at that item's allocated payment, and reverses commissions
proportionally for cumulative refunds. Refunds require a provider idempotency
reference. Refund recovery is tracked in a separate non-negative ledger
account; any remaining debt is offset against future earnings, and payout
processing is atomic.

## Razorpay TEST MODE checkout

Package checkout uses Razorpay TEST MODE only. The server creates Razorpay
orders, verifies the checkout HMAC signature, and confirms/captures the exact
payment amount with Razorpay before updating the order. The Razorpay secret is
read only by server code. Live key IDs are rejected.

Configure these server environment variables:

```env
VITE_RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
```

Keep the Test Key Secret out of `VITE_*` variables, source control, and browser
code. The application also requires its existing `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` server settings. The checkout requires a reviewed
additive Supabase migration to add test-only order creation, completion, and
cancellation RPCs and to permit a verified test order to become `paid` without
granting course access or running commission logic. That migration must be
approved and applied separately; do not run it automatically.

To test after the server settings and approved migration are deployed:

1. Sign in as a student, open a published package, and continue to checkout.
2. Complete checkout using Razorpay's current Test Mode success test details.
   The receipt should show a paid TEST payment after server verification.
3. Start another checkout and use Razorpay's Test Mode failure test details or
   close the checkout before payment. The receipt should show failed/cancelled,
   and the order must not become paid.
4. Confirm the test payment did not create an affiliate commission, add wallet
   balance, or grant course access.

Live payments remain disabled. A verified live-payment flow must be developed
and reviewed separately before enabling any `rzp_live_` key.
