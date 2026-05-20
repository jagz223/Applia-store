import admin from "firebase-admin";
import { getFirestore, FIRESTORE_COLLECTIONS } from "../firebase-admin";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Alertas críticas (pánico): prioridad alta, vibración en web, sonido por defecto en Android/iOS. */
  urgent?: boolean;
};

type DevicePlatform = "web" | "android" | "ios" | "unknown";

class NotificationService {
  private normalizeUserId(userId: string | number): string {
    return String(userId);
  }

  async registerDeviceToken(
    userId: string | number,
    token: string,
    platform: DevicePlatform = "unknown"
  ): Promise<void> {
    const uid = this.normalizeUserId(userId);
    const db = getFirestore();
    if (!db) {
      console.warn("[push] Firestore no disponible: no se guardará el token para usuario", uid, "— Configura Firebase en .env.");
      return;
    }

    const collection = db.collection(FIRESTORE_COLLECTIONS.USER_DEVICE_TOKENS);

    const existing = await collection
      .where("userId", "==", uid)
      .where("token", "==", token)
      .limit(1)
      .get();

    if (!existing.empty) {
      console.log("[push] Token ya registrado para usuario:", uid);
      return;
    }

    await collection.add({
      userId: uid,
      token,
      createdAt: new Date(),
      updatedAt: new Date(),
      platform: platform || "unknown",
    });
    console.log("[push] Token registrado correctamente para usuario:", uid);
  }

  private async getUserTokens(userId: string | number): Promise<string[]> {
    const db = getFirestore();
    if (!db) return [];

    const uid = this.normalizeUserId(userId);
    const snapshot = await db
      .collection(FIRESTORE_COLLECTIONS.USER_DEVICE_TOKENS)
      .where("userId", "==", uid)
      .get();

    const tokens: string[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as { token?: string | null };
      if (data.token) tokens.push(data.token);
    });
    return tokens;
  }

  /**
   * Elimina un token inválido de Firestore (p. ej. cuando FCM devuelve NotRegistered).
   * Así no volvemos a intentar enviar a ese token.
   */
  async removeDeviceToken(userId: string | number, token: string): Promise<void> {
    const db = getFirestore();
    if (!db) return;

    const uid = this.normalizeUserId(userId);
    const snapshot = await db
      .collection(FIRESTORE_COLLECTIONS.USER_DEVICE_TOKENS)
      .where("userId", "==", uid)
      .where("token", "==", token)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    if (!snapshot.empty) {
      await batch.commit();
      console.log("[push] Token inválido eliminado para usuario:", uid);
    }
  }

  private isTokenInvalidError(error: unknown): boolean {
    if (error == null) return false;
    if (typeof error === "string") {
      return error.includes("NotRegistered") || error.includes("invalid") || error.includes("registration-token");
    }
    if (typeof error !== "object") return false;
    const msg = String((error as { message?: string }).message ?? "");
    const code = String((error as { code?: string }).code ?? "");
    const full = JSON.stringify(error);
    return (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      msg.includes("NotRegistered") ||
      msg.includes("invalid") ||
      full.includes("NotRegistered")
    );
  }

  async sendPushToUser(userId: string | number, payload: PushPayload): Promise<void> {
    const uid = this.normalizeUserId(userId);
    let tokens: string[] = [];
    try {
      tokens = await this.getUserTokens(uid);
    } catch (err) {
      console.error("[push] Error obteniendo tokens para usuario", uid, err);
      return;
    }
    if (tokens.length === 0) {
      console.warn("[push] No device tokens for user:", uid);
      return;
    }

    const data = payload.data ?? {};
    const dataStr = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
    const urgent = payload.urgent === true;
    const webNotif: admin.messaging.WebpushNotification = {
      title: payload.title,
      body: payload.body,
      icon: "/genfeb-logo-new.png",
      ...(urgent
        ? ({
            requireInteraction: true,
            vibrate: [200, 120, 200, 120, 200, 120, 400],
            silent: false,
          } as admin.messaging.WebpushNotification)
        : {}),
    };
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: dataStr,
      webpush: {
        notification: webNotif,
        fcmOptions: data.url ? { link: String(data.url) } : undefined,
      },
      // Android / iOS: importante para que el mismo envío funcione con tokens de teléfono.
      android: {
        priority: urgent ? "high" : "high",
        notification: {
          title: payload.title,
          body: payload.body,
          icon: "ic_launcher",
          ...(urgent ? { sound: "default" } : {}),
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: payload.title, body: payload.body },
            sound: "default",
          },
        },
      },
    };

    let messaging: admin.messaging.Messaging;
    try {
      messaging = admin.messaging();
    } catch (err) {
      console.error("[push] Firebase Messaging no inicializado:", err);
      return;
    }

    try {
      const result = await messaging.sendEachForMulticast(message);
      const success = result.successCount;
      const failed = result.failureCount;
      if (failed > 0) {
        const removePromises: Promise<void>[] = [];
        result.responses.forEach((r, i) => {
          if (!r.success) {
            console.warn("[push] FCM falló para token", i, r.error?.message ?? r.error);
            if (r.error && this.isTokenInvalidError(r.error) && tokens[i]) {
              removePromises.push(
                this.removeDeviceToken(uid, tokens[i]).catch((e) =>
                  console.warn("[push] Error eliminando token inválido:", e)
                )
              );
            }
          }
        });
        await Promise.all(removePromises);
        console.warn("[push] FCM send partial failure:", { success, failed, uid });
      } else {
        console.log("[push] Sent to user", uid, "successCount:", success);
      }
    } catch (error) {
      console.error("[push] Error sending push notification:", error);
      // Fallback: enviar uno por uno para no bloquear por un token expirado
      let sent = 0;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        try {
          await messaging.send({
            token,
            notification: { title: payload.title, body: payload.body },
            data: dataStr,
            webpush: message.webpush,
            android: message.android,
            apns: message.apns,
          });
          sent++;
        } catch (tokenErr) {
          console.warn("[push] Fallback send failed for token", i, tokenErr);
          if (this.isTokenInvalidError(tokenErr)) {
            try {
              await this.removeDeviceToken(uid, token);
            } catch (removeErr) {
              console.warn("[push] Error eliminando token inválido:", removeErr);
            }
          }
        }
      }
      if (sent > 0) {
        console.log("[push] Sent to user", uid, "via fallback, count:", sent);
      }
    }
  }

  async sendNewMessageNotification(params: {
    recipientId: string | number;
    conversationId: number;
    preview: string;
    senderId: string | number;
  }): Promise<void> {
    const db = getFirestore();

    const truncateText = (s: string, max: number) => {
      const t = s.trim();
      return t.length > max ? `${t.slice(0, max)}...` : t;
    };

    const getSenderDisplayName = async (): Promise<string> => {
      if (!db) return "Usuario";
      try {
        const snap = await db.collection(FIRESTORE_COLLECTIONS.USERS).doc(String(params.senderId)).get();
        if (!snap.exists) return "Usuario";
        const u = snap.data() as { name?: string; lastName?: string; firstName?: string; email?: string } | undefined;
        const fromConvRoute = [u?.name, u?.lastName].filter(Boolean).join(" ").trim();
        if (fromConvRoute) return fromConvRoute;
        const fromFirstLast = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim();
        if (fromFirstLast) return fromFirstLast;
        if (u?.email) return String(u.email);
        return "Usuario";
      } catch {
        return "Usuario";
      }
    };

    const senderName = await getSenderDisplayName();
    const raw = typeof params.preview === "string" ? params.preview.trim() : "";
    const lower = raw.toLowerCase();
    const looksLikeLocation =
      (lower.includes("lat") && lower.includes("lng")) ||
      lower.includes("ubicacion") ||
      lower.includes("location") ||
      lower.includes("latitud") ||
      lower.includes("longitud");

    const title = `Nuevo mensaje de ${truncateText(senderName, 18)}`;

    const body = looksLikeLocation
      ? "Te ha compartido su ubicacion."
      : (() => {
          const truncated = raw.length > 90 ? `${raw.slice(0, 90)}...` : raw;
          if (truncated) return `De ${senderName}: ${truncated}`;
          return `De ${senderName}`;
        })();

    await this.sendPushToUser(this.normalizeUserId(params.recipientId), {
      title,
      body,
      data: {
        type: "chat_message",
        conversationId: String(params.conversationId),
        url: `/chat?conversation=${params.conversationId}`,
      },
    });
  }
}

export const notificationService = new NotificationService();

