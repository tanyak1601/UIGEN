import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockCookieStore = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

const mockSign = vi.fn(() => Promise.resolve("mock-jwt-token"));

vi.mock("jose", () => ({
  SignJWT: vi.fn(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: mockSign,
  })),
  jwtVerify: vi.fn(),
}));

import { SignJWT, jwtVerify } from "jose";
import { createSession, getSession, deleteSession, verifySession } from "../auth";
import type { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
});

describe("createSession", () => {
  test("creates a JWT with correct payload and sets cookie", async () => {
    await createSession("user-123", "test@example.com");

    expect(SignJWT).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        email: "test@example.com",
        expiresAt: expect.any(Date),
      })
    );

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "auth-token",
      "mock-jwt-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    );
  });

  test("sets cookie expiration to 7 days from now", async () => {
    await createSession("user-123", "test@example.com");

    const cookieOptions = mockCookieStore.set.mock.calls[0][2];
    const expectedExpiry = new Date("2026-01-22T12:00:00Z");
    expect(cookieOptions.expires).toEqual(expectedExpiry);
  });

  test("passes session payload with correct expiresAt to SignJWT", async () => {
    await createSession("user-456", "other@example.com");

    const jwtPayload = vi.mocked(SignJWT).mock.calls[0][0];
    const expectedExpiry = new Date("2026-01-22T12:00:00Z");
    expect(jwtPayload).toEqual({
      userId: "user-456",
      email: "other@example.com",
      expiresAt: expectedExpiry,
    });
  });
});

describe("getSession", () => {
  test("returns session payload when valid token exists", async () => {
    const mockPayload = {
      userId: "user-123",
      email: "test@example.com",
      expiresAt: "2026-01-22T12:00:00.000Z",
    };
    mockCookieStore.get.mockReturnValue({ value: "valid-token" });
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: "HS256" },
    } as any);

    const session = await getSession();

    expect(mockCookieStore.get).toHaveBeenCalledWith("auth-token");
    expect(jwtVerify).toHaveBeenCalledWith("valid-token", expect.anything());
    expect(session).toEqual(mockPayload);
  });

  test("returns null when no token cookie exists", async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const session = await getSession();

    expect(session).toBeNull();
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  test("returns null when token verification fails", async () => {
    mockCookieStore.get.mockReturnValue({ value: "invalid-token" });
    vi.mocked(jwtVerify).mockRejectedValue(new Error("JWT expired"));

    const session = await getSession();

    expect(session).toBeNull();
  });
});

describe("deleteSession", () => {
  test("deletes the auth-token cookie", async () => {
    await deleteSession();

    expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
  });
});

describe("verifySession", () => {
  function createMockRequest(tokenValue?: string) {
    return {
      cookies: {
        get: vi.fn((name: string) =>
          name === "auth-token" && tokenValue
            ? { value: tokenValue }
            : undefined
        ),
      },
    } as unknown as NextRequest;
  }

  test("returns session payload when valid token exists in request", async () => {
    const mockPayload = {
      userId: "user-789",
      email: "req@example.com",
      expiresAt: "2026-01-22T12:00:00.000Z",
    };
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: "HS256" },
    } as any);

    const request = createMockRequest("valid-token");
    const session = await verifySession(request);

    expect(request.cookies.get).toHaveBeenCalledWith("auth-token");
    expect(jwtVerify).toHaveBeenCalledWith("valid-token", expect.anything());
    expect(session).toEqual(mockPayload);
  });

  test("returns null when no token in request cookies", async () => {
    const request = createMockRequest();
    const session = await verifySession(request);

    expect(session).toBeNull();
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  test("returns null when request token verification fails", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("Invalid signature"));

    const request = createMockRequest("bad-token");
    const session = await verifySession(request);

    expect(session).toBeNull();
  });
});
