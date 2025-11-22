# 🔴 RCA: FAQ Generation Failure - Complete Analysis

**Date**: November 22, 2025  
**Status**: 🔴 CRITICAL - FAQ generation failing with "Edge Function returned a non-2xx status code"  
**Severity**: HIGH - Users cannot generate FAQs

---

## 📊 ISSUES IDENTIFIED

### Issue #1: Frontend Error Handling Bug ❌
**Location**: `src/components/dashboard/FAQCreator.tsx` (lines 586-605)

**Problem**:
- Edge function returns 400 status with error in `responseData.message` field
- Frontend checks for `responseData.error` field (which doesn't exist)
- Error message is never extracted, causing generic error display

**Current Code**:
```typescript
if (responseData.error) {
  console.error('Data contains error:', responseData.error);
  throw new Error(responseData.error);
}
```

**Should Be**:
```typescript
if (responseData.error || responseData.message) {
  console.error('Data contains error:', responseData.error || responseData.message);
  throw new Error(responseData.error || responseData.message);
}
```

---

### Issue #2: File Upload Not Disabled for Expired Plans ❌
**Location**: `src/components/dashboard/FAQCreator.tsx` (lines 1112-1118)

**Problem**:
- File upload input has NO `disabled={isExpired}` attribute
- URL and Text inputs ARE disabled, but file upload is NOT
- Users with expired plans can still upload files

**Current Code**:
```typescript
<input
  type="file"
  accept=".pdf,.docx,.txt"
  onChange={handleFileUpload}
  className="hidden"
  id="file-upload"
/>
```

**Should Be**:
```typescript
<input
  type="file"
  accept=".pdf,.docx,.txt"
  onChange={handleFileUpload}
  disabled={isExpired}
  className="hidden"
  id="file-upload"
/>
```

---

### Issue #3: Upload Label Not Disabled Visually ❌
**Location**: `src/components/dashboard/FAQCreator.tsx` (lines 1119-1124)

**Problem**:
- Label wrapping file input is not disabled
- Users can still click and upload even if plan expired
- No visual feedback that upload is disabled

**Solution**:
- Add conditional className to disable label styling
- Add pointer-events-none when isExpired

---

## 🔍 ROOT CAUSE ANALYSIS

### Why FAQ Generation Fails:
1. Edge function returns 400 status code (correct)
2. Response body contains: `{ error: true, message: "...", details: "..." }`
3. Frontend checks for `responseData.error` (boolean) - FOUND ✓
4. But then checks `if (responseData.error)` and throws `responseData.error` (boolean)
5. Should throw `responseData.message` instead

### Why File Upload Not Disabled:
1. `isExpired` flag is computed correctly (line 87)
2. URL input uses `disabled={isExpired}` (line 1078) ✓
3. Text input uses `disabled={isExpired}` (line 1097) ✓
4. File input is MISSING `disabled={isExpired}` ❌

---

## ✅ FIXES REQUIRED

1. **Fix error message extraction** in FAQCreator.tsx (line 602-604)
2. **Add disabled attribute** to file input (line 1113)
3. **Add disabled styling** to file upload label (line 1119)
4. **Test FAQ generation** with all input types
5. **Test file upload** with expired plan

---

## 🎯 IMPACT

- **Users with expired plans**: Can still upload files (should be blocked)
- **All users**: Cannot see actual error messages (generic error shown)
- **FAQ generation**: Fails silently with confusing error message

---

## 📈 PERMANENT RESOLUTION

All fixes are frontend-only, no backend changes needed. Changes will be pushed to GitHub and auto-deployed by Vercel.

