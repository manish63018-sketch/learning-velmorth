# Learn with Velmorth v2 — API Contract Specifications

All API endpoints are hosted relative to the project root `/api/*`. Requests require appropriate Authorization headers or valid session cookies.

---

## 1. Identity & System Gating

### `GET /api/limits/check`
Retrieves daily study limits and current usage counters for the requesting user.
* **Headers:**
  * `Authorization: Bearer <JWT_TOKEN>` (Required)
* **Response `200 OK` (JSON):**
  ```json
  {
    "plan": "free",
    "status": "free",
    "ads_enabled": true,
    "hearts_limit": 25,
    "hearts_used": 2,
    "hearts_remaining": 23,
    "ai_limit_daily": 5,
    "ai_used_today": 1,
    "can_use_ai": true,
    "lessons_limit_daily": 5,
    "lessons_today": 0,
    "can_start_lesson": true
  }
  ```
* **Error Responses:**
  * `401 Unauthorized` (Token missing or invalid)
  * `500 Server Error`

### `POST /api/user/delete`
Deletes the active user account and triggers cascades in Supabase.
* **Headers:** Cookie session based or Bearer token.
* **Response `200 OK` (JSON):**
  ```json
  {
    "success": true,
    "message": "Account successfully scheduled for deletion"
  }
  ```

---

## 2. Learning & Progress Mutators

### `POST /api/progress/complete-lesson`
Saves scores, completes a lesson, triggers streak upgrades, and increments XP balance.
* **Headers:** Cookie session based.
* **Request Body (JSON):**
  ```json
  {
    "lessonId": "jlpt-n5-greetings-01",
    "score": 90,
    "xp": 15,
    "timeSeconds": 120,
    "wordsCount": 5,
    "metadata": {
      "mistakes": ["さようなら"]
    }
  }
  ```
* **Response `200 OK` (JSON):**
  ```json
  {
    "success": true,
    "result": {
      "xp_awarded": 15,
      "gems_awarded": 5,
      "streak_updated": 6
    }
  }
  ```
* **Error Responses:**
  * `400 Bad Request` (Missing fields or score/XP invalid)
  * `401 Unauthorized`
  * `500 Internal Server Error`

---

## 3. AI Sakura Engines

### `POST /api/ai/conversation`
Evaluates and continues dialogue exchanges with Sakura.
* **Request Body (JSON):**
  ```json
  {
    "session_id": "session-uuid",
    "messages": [
      { "role": "user", "content": "こんにちは！" },
      { "role": "assistant", "content": "こんにちは！お元気ですか？" },
      { "role": "user", "content": "元気です。You?" }
    ],
    "topic": "Daily Greeting",
    "difficulty": "beginner",
    "user_id": "user-uuid"
  }
  ```
* **Response `200 OK` (JSON):**
  ```json
  {
    "content_ja": "私も元気です！今日は何を勉強しますか？",
    "content_romaji": "Watashi mo genki desu! Kyou wa nani o benkyou shimasu ka?",
    "content_en": "I'm doing well too! What will we study today?",
    "grammar_note": "💡 \"私も\" (watashi mo) means \"Me too\" or \"I also\"."
  }
  ```
* **Error Responses:**
  * `429 Too Many Requests` (Rate limited)
  * `500 Server Error`

### `POST /api/ai/explain`
Explains grammar errors made by the student.
* **Request Body (JSON):**
  ```json
  {
    "question": "Choose the correct particle: 私はパン ___ 食べます。",
    "userAnswer": "に",
    "correctAnswer": "を",
    "language": "en"
  }
  ```
* **Response `200 OK` (JSON):**
  ```json
  {
    "explanation": "You used the particle 'に' (ni) which indicates direction or time. In Japanese, the object of a transitive verb like '食べます' (to eat) takes the object marker particle 'を' (o). Therefore, the correct sentence is '私はパンを食べます' (I eat bread).",
    "romaji": "Watashi wa pan o tabemasu."
  }
  ```

### `POST /api/ai/word-explainer`
Explores deep definitions, mnemonics, and examples for a vocabulary word.
* **Request Body (JSON):**
  ```json
  {
    "word": "食べる",
    "romaji": "taberu"
  }
  ```
* **Response `200 OK` (JSON):**
  ```json
  {
    "word": "食べる",
    "romaji": "taberu",
    "meanings": ["to eat"],
    "mnemonic": "💡 Imagine a table with food on it. You sit at the 'taberu' (table) to eat!",
    "examples": [
      {
        "ja": "寿司を食べます。",
        "romaji": "Sushi o tabemasu.",
        "en": "I eat sushi."
      }
    ]
  }
  ```

### `POST /api/ai/writing-coach`
Scores handwritten characters and offers detailed correction tips.
* **Request Body (JSON):**
  ```json
  {
    "char_id": "あ",
    "char_type": "hiragana",
    "strokes": [
      [[10, 20], [90, 20]],
      [[50, 10], [50, 80]],
      [[30, 40], [80, 50], [40, 70]]
    ]
  }
  ```
* **Response `200 OK` (JSON):**
  ```json
  {
    "accuracy_score": 85,
    "stroke_order_score": 100,
    "shape_score": 80,
    "proportion_score": 90,
    "suggestions": [
      "The horizontal stroke is slightly short.",
      "The loop at the bottom should be wider."
    ]
  }
  ```

---

## 4. Payment & Billing Integrations

### `POST /api/billing/create-order`
Initiates a new Razorpay subscription checkout.
* **Request Body (JSON):**
  ```json
  {
    "planId": "pro"
  }
  ```
* **Response `200 OK` (JSON):**
  ```json
  {
    "orderId": "order_MokH47fS7fH",
    "amount": 29900,
    "currency": "INR",
    "key": "rzp_test_key",
    "planName": "Pro Learner",
    "periodLabel": "Monthly",
    "periodDays": 30,
    "endsAt": "2026-07-26T15:54:21.000Z"
  }
  ```
* **Error Responses:**
  * `400 Bad Request` (Invalid planId)
  * `503 Service Unavailable` (Razorpay keys not configured)

### `POST /api/billing/verify`
Validates payment signatures server-side on transaction completion.
* **Request Body (JSON):**
  ```json
  {
    "razorpay_order_id": "order_MokH47fS7fH",
    "razorpay_payment_id": "pay_MokH99aB00z",
    "razorpay_signature": "hmac_hash_signature",
    "planId": "pro"
  }
  ```
* **Response `200 OK` (JSON):**
  ```json
  {
    "success": true,
    "message": "Payment verified and subscription active."
  }
  ```

---

## 5. Social Functions

### `POST /api/social/friends`
Creates or mutates friend connection configurations.
* **Request Body (JSON):**
  ```json
  {
    "action": "send_request",
    "friend_id": "friend-uuid"
  }
  ```
* **Response `200 OK` (JSON):**
  ```json
  {
    "success": true,
    "status": "pending"
  }
  ```
