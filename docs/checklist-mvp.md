# MVP Web App - Implementation Checklist

**Priority:** Essential features để hoàn thiện hệ thống quản lý vaccine  
**Timeline:** 15-25 ngày (1 full-stack developer)  
**Scope:** Dashboard + API (không bao gồm mobile app, reports, PWA)

---

## ✅ Phase 1: Authentication & User Management (5-7 days)

### Backend APIs
- [ ] `POST /auth/register` - User registration endpoint
  - Validate email/phone
  - Hash password
  - Save to Firebase
  - Return JWT token

- [ ] `POST /auth/login-with-signature` - Web3 signature verification
  - Message signing (MetaMask)
  - Verify signature
  - Check user exists
  - Return JWT token

- [ ] `GET /user/profile` - Get current user profile
  - Return user details
  - Show assigned roles

- [ ] `PUT /user/profile` - Update user profile
  - Edit name, email
  - Change password
  - Update preferences

- [ ] `POST /admin/users` - Create new user (admin only)
  - Assign roles
  - Set permissions
  - Send activation email

- [ ] `GET /admin/users` - List all users (admin only)
  - Pagination
  - Filter by role
  - Search by name/email

- [ ] `PUT /admin/users/:id` - Update user roles (admin only)
  - Grant/revoke roles
  - Update status

- [ ] `DELETE /admin/users/:id` - Delete user (admin only)
  - Soft delete
  - Archive data

### Frontend Pages
- [ ] `/auth/register` - Registration form
  - Email input
  - Password input
  - Role selection
  - Submit button
  - Success/error messages

- [ ] `/auth/login` - Real login (replace current demo)
  - Email + password login
  - Web3 signature login (MetaMask)
  - Remember me option
  - Forgot password link

- [ ] `/user/profile` - User profile page
  - Display user info
  - Edit form
  - Change password
  - Logout button

- [ ] `/admin/users` - User management dashboard
  - User list table
  - Search/filter
  - Edit button
  - Delete button
  - Assign roles form
  - Create new user button

### Security
- [ ] Implement JWT token validation on protected routes
- [ ] Add role-based access control (RBAC) middleware
- [ ] Hash passwords using bcrypt
- [ ] Secure JWT storage in localStorage
- [ ] Refresh token mechanism

---

## ✅ Phase 2: Product Management UI (3-4 days)

### Backend APIs
- [x] `GET /products?search=&status=&sort=` - Search & filter products
  - Search by serial ID
  - Filter by status
  - Filter by manufacturer
  - Sorting options

- [x] `GET /products/:serialId/detail` - Get full product details
  - All product metadata
  - Transfer history
  - Risk flags
  - Blockchain tx info

- [x] `PUT /products/:serialId` - Edit product metadata
  - Update expiry date
  - Update notes
  - (Some fields read-only on blockchain)

- [x] `POST /products/bulk` - Bulk register products
  - CSV UI converts rows to API payload
  - Validate data
  - Batch register
  - Return progress

### Frontend Pages
- [x] `/dashboard/products` - Products list page
  - Table view
  - Search bar
  - Filter options
  - Sort options
  - Pagination
  - Click row to details

- [x] `/dashboard/products/:id` - Product detail page
  - Full product info
  - QR code display
  - Blockchain tx link
  - IPFS data link
  - Edit metadata button
  - Transfer button
  - Risk history

- [x] `/dashboard/batches` - Batches management
  - List all batches
  - Filter by status
  - Batch detail view
  - Recall batch button
  - View serials in batch

- [x] `/dashboard/products/register` - Enhanced register form
  - Form validation
  - QR preview
  - Success confirmation
  - Next steps button

---

## ✅ Phase 3: Error Handling & User Feedback (2-3 days)

### Frontend UI Components
- [x] Error boundary component
  - Catch React errors
  - Display error message
  - Reload button

- [x] Error pages
  - 404 Not Found
  - 500 Server Error
  - 403 Access Denied
  - Network Error

- [x] Toast notifications (using Sonner)
  - Success messages
  - Error messages
  - Info messages
  - Warning messages
  - Dismiss after 5s

- [x] Loading skeletons
  - Product list skeleton
  - Detail page skeleton
  - Table row skeleton
  - Card skeleton

- [x] Validation error messages
  - Inline field errors
  - Form submission errors
  - Clear error descriptions
  - Helpful hints

### Backend Improvements
- [x] Consistent error response format
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE",
      "message": "User-friendly message",
      "details": "Technical details"
    }
  }
  ```

- [x] Error logging
  - Log all API errors
  - Stack traces
  - User context
  - Timestamp

---

## ✅ Phase 4: Input Validation & Data Integrity (1-2 days)

### Frontend Validation
- [x] Zod schema validation
  - Email format
  - Address format
  - Hash format
  - Serial ID format
  - Expiry date format

- [x] Real-time field validation
  - Show error as user types
  - Enable/disable submit button
  - Field-level error messages

- [x] Form submission validation
  - Validate all fields
  - Show summary of errors
  - Prevent double submission

### Backend Validation
- [x] Joi/Zod validation middleware
  - Validate all inputs
  - Return 400 on invalid
  - Clear error messages

- [x] Database constraints
  - Unique constraints (serial ID)
  - Required fields
  - Type checking

---

## ✅ Phase 5: Risk Management UI (1-2 days)

### Frontend Pages
- [x] `/dashboard/risk-flags` - Risk alerts dashboard
  - List flagged products
  - Risk level badge (HIGH, MEDIUM, LOW)
  - Reason explanation
  - Quick action buttons
  - Mark as resolved

- [x] `/dashboard/disputes` - Dispute management
  - List disputes
  - Status badge
  - View evidence
  - Add note
  - Close dispute button

### Backend APIs
- [x] `GET /risk-flags/:id` - Get risk flag details
- [x] `PUT /risk-flags/:id/resolve` - Mark risk as resolved
- [x] `GET /disputes/:id` - Get dispute details
- [x] `PUT /disputes/:id/status` - Update dispute status
- [x] `POST /disputes/:id/evidence` - Add evidence

---

## ✅ Phase 6: Dashboard Enhancements (2-3 days)

### Backend APIs
- [ ] `GET /dashboard/overview` - Enhanced stats
  - Total products registered
  - Total batches
  - Pending transfers
  - Risk alerts count
  - Recalled batches count
  - Last 7 days trend

- [ ] `GET /dashboard/recent-activity` - Recent activities
  - Latest registrations
  - Latest transfers
  - Latest risk alerts
  - Limit 10

### Frontend Updates
- [ ] Dashboard cards update
  - Dynamic stats from API
  - Trending indicators
  - Quick action links

- [ ] Dashboard sidebar
  - Active route highlight
  - Collapsible menu
  - Role-based menu items

- [ ] Dashboard header
  - User profile dropdown
  - Notification icon (with count)
  - Settings link

---

## ✅ Phase 7: Transfer Management UI (1-2 days)

### Frontend Pages
- [ ] `/dashboard/transfers` - Transfers list page
  - Table view
  - Filter by status
  - Filter by product
  - Pending alert badge
  - Click to details

- [ ] `/dashboard/transfers/:id` - Transfer detail page
  - Timeline view
  - From/To info
  - Status updates
  - Blockchain tx link
  - Action buttons (confirm/reject/cancel)

### Backend APIs (mostly done, need UI)
- [ ] UI for `/transfers/scan` - Already done
- [ ] UI for `/transfers/confirm` - Already done
- [ ] UI for `/transfers/reject` - Already done

---

## ✅ Phase 8: Mobile Responsive Design (2 days)

### Frontend Responsive Updates
- [ ] Mobile header
  - Hamburger menu
  - Compact logo
  - Touch-friendly buttons

- [ ] Mobile navigation
  - Bottom navigation bar (for mobile)
  - Slide drawer menu
  - Active route indicator

- [ ] Responsive tables
  - Stack on mobile
  - Card view on mobile
  - Scrollable on small screens

- [ ] Touch-friendly UI
  - Larger buttons (44x44px min)
  - Adequate spacing
  - No hover-only features

- [ ] Images & assets
  - Responsive images
  - Optimized for mobile
  - Lazy loading

### Testing
- [ ] Test on mobile devices
- [ ] Test on tablets
- [ ] Test responsive breakpoints
- [ ] Test touch interactions

---

## 📋 Completed Features (✓ Already Done)

```
✓ Smart contracts deployed (Sepolia)
✓ Backend API structure
✓ Firebase integration
✓ IPFS integration
✓ QR code generation
✓ Basic authentication (demo)
✓ Product registration API
✓ Transfer endpoints
✓ Public verification page
✓ Dashboard skeleton
✓ Login page (demo)
✓ UI components (buttons, cards, etc)
✓ Toast notifications (Sonner)
```

---

## 🎯 Priority Order

### Week 1-2 (Critical):
1. Real authentication system
2. User management admin panel
3. Error handling & validation UI

### Week 3-4 (Important):
4. Product management UI
5. Transfer management UI
6. Risk management UI

### Week 5+ (Polish):
7. Dashboard enhancements
8. Mobile responsive design
9. Performance optimization

---

## 📊 Dependencies

```
Authentication
    ↓
User Management (uses auth)
    ↓
Product Management (uses auth + validation)
    ↓
Transfer Management (uses auth + product)
    ↓
Risk Management (uses transfer)
    ↓
Dashboard (uses all above)
    ↓
Mobile Responsive (applies to all)
```

---

## 🔧 Tech Stack

### Frontend
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Shadcn/ui components
- Axios (API calls)
- React Hook Form (forms)
- Zod (validation)
- Sonner (notifications)

### Backend
- Express.js
- Node.js
- TypeScript
- Firebase
- ethers.js
- Joi/Zod (validation)
- JWT (auth)
- bcrypt (password hashing)

### Blockchain
- Solidity (smart contracts)
- Hardhat (local development)
- Sepolia testnet (deployment)

---

## 📝 Notes

- All APIs return consistent JSON format
- Use TypeScript for type safety
- Add comprehensive error handling
- Validate all user inputs
- Use environment variables for config
- Test before deploying
- Keep API documentation updated
- Follow REST conventions

---

**Last Updated:** May 28, 2026  
**Status:** Ready to implement  
**Estimated Completion:** ~3-4 weeks (1 developer)
