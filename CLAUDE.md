# MUSCLE MOTIVATION — Claude Reference File
# Version 1.0 | Source of Truth for All Development

This file is read automatically by Claude Code at the start of every terminal session.
All guidelines here are binding. Do not deviate without explicit instruction.

---

## 1. CODING RULES (Read First, Every Time)

- **Never rewrite full files** unless explicitly asked
- **Surgical edits only** — change the minimum needed to accomplish the task
- **Never modify `calculator.html`** under any circumstances
- **Never fabricate statistics, testimonials, or outcomes**
- **Always show diffs before committing** destructive or wide-reaching changes
- **Always confirm before modifying Supabase data**
- **Read the relevant file before suggesting any fix**
- **Work feature by feature** — do not rebuild the entire platform at once
- **Preserve existing styling** — check existing pages for design consistency before any UI change
- **Explain every file changed**
- Before any UI change: check existing pages for visual consistency

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, JavaScript (no frameworks yet) |
| Hosting | Vercel (Hobby plan) |
| Version Control | GitHub (`effinett/muscle-Motivation`) |
| Database / Auth | Supabase (client renamed `supabaseClient` to avoid namespace conflicts; explicit UMD CDN build path) |
| Payments | Stripe |
| AI | OpenAI / Claude API (coaching, food logging, workout recs, sales assistant) |
| Future Mobile | React Native or Flutter |

**Supabase notes:**
- Auth calls wrapped in `window.addEventListener('load', ...)`
- DDL changes must go through `apply_migration` (tracked), not `execute_sql`
- Verify schema via `pg_proc` and `pg_indexes` directly — Supabase advisor may return stale results

**Git notes:**
- Repo path: `~/muscle-Motivation` (home dir, not Downloads)
- Username: `effinett`, repo: `muscle-Motivation` (capital M)
- Use `-C /Users/effi/muscle-Motivation` flag rather than `cd`
- Push requires token embedded in URL: `git push https://effinett:[token]@github.com/effinett/muscle-Motivation.git main`
- Vercel auto-deploys on push to `main` within ~2 minutes

**Vercel / Stripe debugging:**
- "Webhook signature failed" (400) → mismatched `whsec_` secret; re-copy exact signing secret from Stripe dashboard and redeploy
- "ON CONFLICT no matching constraint" (500) → partial unique index with `WHERE` doesn't satisfy plain `ON CONFLICT`; drop partial index, create plain unique index
- Diagnostic sequence: `get_runtime_logs` (Vercel) + `get_logs` (Supabase) together

---

## 3. USER FLOW

```
auth.html → onboarding.html (first-time users)
         → app.html (returning users)
```
- Google OAuth routes through `onboarding.html`
- New users complete onboarding before accessing dashboard

---

## 4. BRAND GUIDELINES (v1.0 — Source of Truth)

### Mission
Make professional fitness coaching accessible, affordable, and personalized through coaching, technology, and AI.

### Vision
All-in-one fitness OS — learn, train, track, eat, improve, communicate with AI and coaches, purchase programs, join community — without ever leaving the platform.

### Core Values
Consistency · Simplicity · Accountability · Discipline · Education · Long-Term Results

### Brand Personality
**BE:** Motivating, Professional, Supportive, Direct, Practical, Results-Oriented
**NEVER BE:** Judgmental, Aggressive, Bro-science based, Overly complicated, Corporate, Generic

### Brand Voice
Sounds like a knowledgeable personal trainer who genuinely wants the user to succeed.
- Clear · Confident · Encouraging · Practical · Honest
- ❌ "Optimize nutrient timing for maximal hypertrophic adaptation."
- ✅ "Hit your protein, train hard, and stay consistent."

### Brand Promise
Practical fitness solutions that help people achieve real, sustainable results through consistency, accountability, education, and intelligent coaching.

### Marketing Rules
**Focus on:** Results, Simplicity, Education, Sustainability
**Avoid:** Unrealistic promises, fear-based marketing, extreme transformations, clickbait

---

## 5. DESIGN SYSTEM (v1.0 — Source of Truth)

### Feel
Premium · Athletic · Clean · Masculine · Minimal · Motivating
**NOT:** Cheap · Cluttered · Cartoonish · Generic · Sci-fi · Neon

### Color Palette
| Token | Hex |
|---|---|
| Background | `#050505` |
| Surface | `#111111` |
| Card | `#181818` |
| Border | `#2A2A2A` |
| Primary Text | `#FFFFFF` |
| Secondary Text | `#B8B8B8` |
| Muted Text | `#777777` |
| Accent Red | `#B1121B` |
| Accent Red Hover | `#D11D27` |

### Typography
| Font | Usage |
|---|---|
| **Bebas Neue** | Hero headlines, section titles, program titles, big numbers, CTAs |
| **Inter** | Paragraphs, forms, dashboard labels, body copy, small text |

### Buttons
- **Primary:** Deep red background · white text · bold uppercase · slight hover effect
- **Secondary:** Transparent/dark surface · white text · gray border
- **CTA examples:** START NOW · VIEW PROGRAMS · LOG WORKOUT · UPDATE PROGRESS · ASK AI COACH

### Cards
- Dark surface · subtle border · 16–24px padding · 12–20px border radius · clear title · one main action

### Layout
- Big bold headings · strong spacing · clean cards · rounded corners · subtle borders · simple icons · clear CTAs
- **Avoid:** Too many colors · thin unreadable text · random fonts · inconsistent spacing · overloaded sections

### Mobile (Mobile-First)
- Large buttons · easy thumb navigation · minimal typing · quick logging · clear progress bars · sticky bottom navigation

### Logo
- White logo on dark background (preferred)
- Never: stretch, distort, recolor, or add effects
- File: `logow.png`

### Visual Avoid List
- Neon colors · gaming aesthetics · excessive animations · cluttered layouts · cheap stock imagery
- Blue SaaS look · neon gaming look · overly playful design · too much animation

---

## 6. PRODUCT CATALOG (v1.0 — Source of Truth)

### Product Ladder (use throughout site + AI)
```
Free Guide → Program Purchase → Membership → Premium Coaching
```

### Free
| Product | Price | Purpose |
|---|---|---|
| Getting Started Guide | Free | Lead gen — fat loss fundamentals, nutrition basics, training basics, habit recs |

### Digital Programs (One-Time Purchase)
| Product | Slug | Price | Target |
|---|---|---|---|
| 90-Day Fat Loss Blueprint | `fat_loss_blueprint` | $49 | Beginner–intermediate fat loss |
| Muscle Gain Program | `muscle_gain` | $59 | Users prioritizing muscle growth |
| Glute Builder Program | `glute_builder` | $39 | Lower body / glute development |
| Home Strength Program | TBD | TBD | Bodyweight + dumbbells |
| Full Gym Strength Program | TBD | TBD | Full gym equipment |

### Membership
| Product | Slug | Price | Includes |
|---|---|---|---|
| Muscle Motivation Membership | `ai_membership` | $29/mo | Workout tracking, nutrition tracking, weight tracking, habit tracking, progress analytics, program library access, AI coach access |

### Premium Coaching
- Price: TBD
- Includes: Personalized programming, direct coach access, accountability, progress reviews, nutrition guidance

### Future Products
Specialized fat loss/muscle programs · Sports performance · Youth fitness · Mobility · Business coaching for trainers

---

## 7. FEATURE ROADMAP (v1.0 — Source of Truth)

### Phase 1 — MVP (v1.0) ← CURRENT FOCUS
**Goal:** Launch a functional platform capable of generating revenue and delivering results.

- **Auth:** Sign up, login, logout, password reset, Google OAuth
- **Onboarding:** Goal questionnaire, macro calculation, program recommendation
- **Dashboard:** Today's workout, weight trend graph + log, calories, protein, steps, water, streaks
- **Programs:** Product catalog, purchases, program access
- **Stripe:** One-time purchases, membership subscriptions
- **Workout Tracking:** Exercise logging, set/rep/weight logging, personal records
- **Progress Tracking:** Weight logging, weight trend graph
- **AI Coach:** Chat interface, training guidance, nutrition guidance, accountability

**MVP Build Order:**
1. Auth → 2. Onboarding → 3. Dashboard → 4. Program library → 5. Stripe purchases → 6. Weight tracking → 7. Workout logging → 8. AI Coach chat → 9. Nutrition text logging → 10. Admin dashboard

### Phase 2 — Member Experience (v1.5)
- Nutrition tracking (food search, macro/calorie tracking)
- Habit tracking (protein/water/sleep/step goals)
- Expanded progress (body fat, measurements, photos)
- Advanced dashboard analytics (weekly/monthly reports, trend analysis)

### Phase 3 — AI Expansion (v2.0)
- Voice food logging · Photo food logging (meal recognition, cal/macro estimation)
- Advanced coaching: plateau detection, auto recommendations, smart goal adjustments
- AI check-ins: daily, weekly, monthly

### Phase 4 — Integrations & Mobile (v3.0)
- iOS + Android apps · Apple Health + Google Fit · Wearables · Push notifications

### Phase 5 — Community (v4.0)
- Community feed · Groups · Challenges · Leaderboards · Success stories · Member profiles

### Phase 6 — Scale (v5.0)
- Coach dashboard + marketplace · Team coaching · Corporate wellness · Advanced analytics · Automation

### Development Rules
1. Build one phase at a time
2. Complete existing features before adding new ones
3. UX over feature count
4. Mobile-first design
5. Data accuracy before visual enhancements
6. Maintain consistency with Brand Guidelines and Technical Requirements

**Success Metric:** "Does this help users achieve better fitness results more easily?" If no — don't build it.

---

## 8. DATABASE TABLES (Required)

```
users / profiles
onboarding_responses
workouts
workout_exercises
workout_sets
exercises
nutrition_logs
food_items
body_weight_logs
body_fat_logs
measurement_logs
progress_photos
habit_logs
programs
program_workouts
purchases
subscriptions
ai_chat_messages
admin_notes
```

### Permissions
| User Type | Access |
|---|---|
| Free user | Calculator, limited dashboard, free guide |
| Program buyer | Purchased programs only |
| Member | Full tracking, AI Coach, program library |
| Premium coaching client | Full access + coach review + personalized programming |
| Admin | Full platform control |

---

## 9. USER ONBOARDING (Data Collected)

**Inputs:**
Name · Age · Gender · Height · Weight · Body fat estimate · Goal · Activity level · Training experience · Days/week available · Gym access

**System Calculates:**
Maintenance calories · Target calories · Protein target · Fat target · Carb target · Recommended training split · Daily habits

---

## 10. AI COACH INSTRUCTIONS (v1.0 — Source of Truth)

### Role
Muscle Motivation AI Coach — help users lose fat, build muscle, improve health, stay consistent, maintain long-term results. **Not a doctor.** Refer medical concerns, injuries, medications, eating disorders, chest pain, fainting, or serious symptoms to qualified professionals.

### Personality
**Be:** Motivating · Direct · Supportive · Practical · Honest · Results-oriented · Simple · Human
**Never be:** Overly soft · Overly complicated · Judgmental · Robotic · Extreme · Unsafe

### Core Principles
1. Consistency beats perfection
2. Sustainable fat loss > crash dieting
3. Progressive overload drives muscle gain
4. Protein, calories, steps, sleep, training consistency matter most
5. Simple plans win
6. Adjust based on data, not emotion
7. The user should always know the next action

### User Data to Use When Available
Age · Gender · Height · Weight · Body fat estimate · Goal · Training experience · Training days · Gym access · Calories · Macros · Workout history · Nutrition logs · Weight trend · Habit compliance

### Fat Loss Guidance
- Moderate calorie deficit + high protein + strength training + daily steps + weekly weight average
- Adjust every 2–3 weeks based on trend
- Never recommend extreme starvation diets

### Muscle Gain Guidance
- Small calorie surplus + progressive overload + adequate protein + enough carbs to train hard
- Track strength and body weight

### Plateau Detection (weight hasn't moved 2–3 weeks)
**Check:** Calorie consistency · Weekend eating · Steps · Sleep · Training consistency · Food tracking accuracy
**Then suggest:** Increase steps · Slight calorie reduction · Improve tracking · Add structure
**Do not panic-adjust too soon**

### Accountability Check-In Format
1. Review what happened
2. Identify one win
3. Identify one fix
4. Give next action
- Use simple language: *"Here's the move today…"*

### Response Format
1. Direct answer
2. Why it matters
3. Exact next step

**Example:** *"Keep calories the same this week. Your weight only stalled for four days, which is normal. Hit your protein, get your steps, and compare your weekly average next Monday."*

### Hard Boundaries
- No medical diagnosis · No medication advice · No unsafe weight loss · No shame · No steroid advice · No guaranteed results · Never replace human coach when premium coaching is needed

---

## 11. NUTRITION LIBRARY (v1.0 — Source of Truth)

### Philosophy
Sustainability · Consistency · Adequate Protein · Calorie Control · Long-Term Adherence

### Protein Guidelines
| Goal | Target |
|---|---|
| Fat Loss | 0.8–1.0g per lb of **goal** body weight |
| Muscle Gain | 0.7–1.0g per lb of body weight |
| Maintenance | 0.7–1.0g per lb of body weight |

### Fat Loss Framework
Primary targets: Calorie deficit · High protein · Resistance training · Daily activity · Sleep quality
Adjust only after reviewing: Body weight trend · Compliance · Step count · Training consistency

### Muscle Gain Framework
Small calorie surplus · Progressive overload · High protein · Consistent training

### Meal Formula
**Protein Source + Fruit/Vegetable + Carbohydrate Source + Healthy Fat**

### Food Categories
- **Proteins:** Chicken, turkey, lean beef, fish, eggs, Greek yogurt, cottage cheese, protein powder
- **Carbs:** Rice, potatoes, oats, bread, quinoa, pasta, fruit
- **Fats:** Nuts, nut butter, avocado, olive oil
- **Vegetables:** Broccoli, carrots, spinach, peppers, salad greens

### Restaurant Guidance
1. Protein first · 2. Vegetables second · 3. Smart carb choices · 4. Portion awareness

### AI Food Logging Rules
- **Text:** User enters foods manually
- **Voice:** AI converts speech to foods + macros
- **Photo:** AI estimates calories/protein/carbs/fat — all estimates must be labeled as estimates
- Nutrition values must come from **verified food databases**, not AI-generated
- All entries confirmed by user before saving
- All logged foods contribute to daily cal/protein/carb/fat/micronutrient tracking

### Coaching Priorities (in order)
1. Calories · 2. Protein · 3. Consistency · 4. Food Quality · 5. Meal Timing
**AI Coach always prioritizes adherence over perfection.**

---

## 12. WORKOUT LIBRARY (v1.0 — Source of Truth)

### Training Philosophy
Progressive Overload · Consistency · Simplicity · Sustainability · Evidence-Based

### Movement Categories
| Category | Examples |
|---|---|
| Squat | Back squat, front squat, goblet squat, split squat, leg press |
| Hinge | Romanian deadlift, conventional deadlift, trap bar deadlift, hip thrust |
| Horizontal Push | Bench press (flat/incline), DB press (flat/incline), push-up |
| Vertical Push | Overhead press, DB shoulder press, side lateral raises |
| Horizontal Pull | Barbell row, DB row, seated cable row, machine row |
| Vertical Pull | Pull-up, chin-up, lat pulldown |
| Core | Plank, crunches, lying leg raises, Russian twists, dead bug, hanging knee raise |
| Carry | Farmer carry, suitcase carry |
| Biceps | Curl variations |
| Triceps | Pushdown variations, overhead extension, dips |
| Calves | Standing calf raise, seated calf raise |

### Program Structure
| Level | Frequency | Focus |
|---|---|---|
| Beginner | 2–3 days/week | Movement mastery, consistency, technique |
| Intermediate | 3–5 days/week | Progressive overload, volume progression |
| Advanced | 4–6 days/week | Specialization, performance optimization |

### Progressive Overload Rules
- All sets/reps completed with good form → **increase weight next workout**
- Target reps barely achieved → **repeat weight**
- Reps missed → **repeat weight or reduce slightly**

### Session Priority Order
1. Warm-up
2. Major compound movement
3. Secondary compound movement
4. Upper-body push
5. Upper-body pull
6. Accessory work
7. Core

### Exercise Database Fields (Required for every exercise)
Name · Category · Primary Muscles · Secondary Muscles · Equipment · Difficulty · Coaching Cues · Common Mistakes · Video Demo Link · Muscle Diagram

---

## 13. WEBSITE STRUCTURE

### Public Pages
- **Home** — Hero, Benefits, Calculator CTA, Testimonials, Programs, Membership, Contact
- **About** — Company story, mission, coach bio
- **Programs** — All products with details, purchase options, reviews
- **Pricing** — Plan comparison
- **Contact** — Form, email, social links, WhatsApp

### Member Pages
- **auth.html** — Login / sign up
- **onboarding.html** — Goal questionnaire + macro setup (new users + Google OAuth)
- **app.html** — Member dashboard (returning users)
- **program-fat-loss.html** — 90-Day Fat Loss Blueprint (live)
- **program-muscle-gain.html** — Muscle Gain Program
- **program-glute-builder.html** — Glute Builder Program

### Dashboard Displays
Today's workout · Weight trend · Calories · Protein · Steps · Water · Sleep · Streak · Progress summary · AI Coach access · Program access

---

## 14. BUSINESS MODEL & TARGET CUSTOMER

### Business Model
Free Lead Gen → Digital Programs (one-time) → Membership (recurring) → Premium Coaching (high-ticket) → Merch (future)

### Target Customer
- **Primary:** Ages 18–55 · Goals: fat loss, muscle gain, body recomposition · Challenges: consistency, accountability, nutrition confusion, structure, time
- **Secondary:** Seeking online coaching, home workout plans, personalized AI fitness support

---

## 15. SPRINT BACKLOG (v1.0 — Source of Truth)

### MUST HAVE (MVP — required before public launch)

**Authentication & User Accounts**
- User registration, login/logout, password reset, protected routes, user profile creation, basic account settings

**Onboarding System**
- Personal info: age, gender, height, weight, body fat %
- Goal selection: fat loss, muscle gain, recomposition
- Activity level, training days/week, timeline selection

**Calorie & Macro Calculator**
- Calculate maintenance calories, target calories, protein/fat/carb targets
- Save results to profile, recalculate goals button

**Dashboard**
- Overview cards: current weight, goal weight, calories target, protein target, workout streak
- Today's summary: workout status, calories consumed, protein consumed, steps, water
- Quick actions: log workout, log weight, log food, open AI coach

**Workout Logging**
- Exercise tracking: name, weight, sets, reps, notes
- Workout history, personal records, exercise history
- Progressive overload: show previous performance, suggest next weight/reps, track volume

**Weight & Progress Tracking**
- Body metrics: weight logging, body fat logging, waist measurement, progress notes
- Charts: weight trend graph, body fat graph, goal progress graph

**Nutrition Tracking**
- Food search: USDA database, save favorites, recent foods
- Food logging: breakfast, lunch, dinner, snacks
- Daily tracking: calories, protein, carbs, fat
- Voice logging: natural language food entry
- Photo logging: AI meal recognition, portion estimation, user confirmation before saving

**Membership & Program Access**
- Free tier: calculator, limited dashboard, free guide
- Program ownership: purchased programs, program library, access management

**Payments**
- Stripe: one-time purchases, monthly subscriptions, checkout pages, customer portal

**Mobile Optimization**
- Fully responsive, mobile dashboard/food logging/workout logging, touch-friendly nav

---

### SHOULD HAVE (important for retention — build after MVP)

**AI Coach**
- Fitness: workout recommendations, exercise substitutions, progressive overload guidance
- Nutrition: macro guidance, meal suggestions, restaurant recommendations
- Goal: weekly check-ins, accountability reminders, motivation support

**Habit Tracking**
- Daily steps, water intake, sleep tracking, habit streaks

**Workout Programs**
- Built-in: Fat Loss Blueprint, Muscle Gain Blueprint, Home Strength, Beginner Program
- Delivery: week-by-week structure, exercise videos, progress tracking

**Notifications**
- Workout reminders, weigh-in reminders, nutrition reminders, goal milestone notifications

**User Profile Enhancements**
- Profile picture, fitness level, injuries/limitations, training preferences

**Progress Photos**
- Upload, side-by-side comparison, timeline view

---

### NICE TO HAVE (enhance engagement — not required for launch)

- Apple Health integration (steps, weight, activity syncing)
- Smart recommendations (exercise, meal, recovery)
- Exercise library (instructions, images, videos, coaching cues; filter by muscle group/equipment/difficulty)
- Community features (member feed, success stories, challenges, leaderboards)
- Referral program (invite friends, rewards, affiliate tracking)
- Trainer notes (client notes, internal coaching comments, session summaries)

---

### FUTURE VISION

**Advanced AI Coach**
- Personalized programming: AI builds complete programs based on equipment/goals/experience/schedule
- Adaptive nutrition: AI adjusts calories/macros based on progress/weight changes/compliance
- Weekly AI reviews: analyze workouts, nutrition, weight trends, habit adherence → generate reports + recommendations
- Voice AI coach: conversational responses to natural language queries

**Computer Vision Progress Analysis**
- Front/side/back photo upload → AI estimates body fat trends, muscle gain, visual progress

**Wearable Integrations**
- Apple Watch, Fitbit, Garmin, Oura Ring, Whoop

**Trainer Portal**
- Client management, progress monitoring, messaging, program assignment
- Business analytics: revenue, retention, churn, client progress metrics

**Marketplace**
- Buy programs (individual + bundles), premium coaching (1-on-1 + group), digital products (guides, meal plans, challenges)

**Ultimate Vision**
One app and website where users can: track workouts, track nutrition, track body metrics, purchase programs, receive AI coaching, receive human coaching, monitor progress, and build lifelong fitness habits.

---

*End of CLAUDE.md — All sections are source of truth. Do not override without explicit instruction from Effi.*
