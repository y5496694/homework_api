// functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Firebase Admin SDK 초기화
admin.initializeApp();

const db = admin.firestore();

/**
 * @name generateCode
 * @description 3~5자리의 고유한 숫자 증명 코드를 생성하여 Firestore에 저장합니다.
 * 반드시 인증된 사용자만 호출할 수 있습니다.
 * @returns {Promise<{code: string}>} 생성된 코드
 */
exports.generateCode = functions
  .region("asia-northeast3") // 서울 리전
  .https.onCall(async (data, context) => {
    // 1. 함수를 호출한 사용자가 로그인했는지 확인합니다.
    if (!context.auth) {
      // 로그인하지 않았다면 'unauthenticated' 오류를 발생시킵니다.
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }

    let newCode;
    let isUnique = false;

    while (!isUnique) {
      const length = Math.floor(Math.random() * 3) + 3;
      const max = Math.pow(10, length);
      const min = Math.pow(10, length - 1);
      newCode = (Math.floor(Math.random() * (max - min)) + min).toString();
      
      const snapshot = await db.collection("proofCodes").where("code", "==", newCode).limit(1).get();
      
      if (snapshot.empty) {
        isUnique = true;
      }
    }

    await db.collection("proofCodes").add({
      code: newCode,
      status: "valid",
      issuedAt: admin.firestore.FieldValue.serverTimestamp(),
      usedAt: null,
      // 어떤 사용자가 코드를 발급했는지 기록 (선택사항)
      issuedBy: context.auth.uid, 
    });
    
    return { code: newCode };
  });


/**
 * @name verifyCode
 * @description 클라이언트로부터 코드를 받아 유효성을 검증하고 상태를 'used'로 변경합니다.
 * 반드시 인증된 사용자만 호출할 수 있습니다.
 * @param {{code: string}} data 클라이언트에서 보낸 데이터
 * @returns {Promise<{success: boolean, message: string}>} 처리 결과
 */
exports.verifyCode = functions
  .region("asia-northeast3") // 서울 리전
  .https.onCall(async (data, context) => {
    // 1. 함수를 호출한 사용자가 로그인했는지 확인합니다.
    // 이 함수는 학생도 호출할 수 있으므로, 로그인 여부만 체크합니다.
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }

    const userCode = data.code;

    if (!userCode || typeof userCode !== 'string' || userCode.length < 3) {
        throw new functions.https.HttpsError('invalid-argument', '유효하지 않은 코드 형식입니다.');
    }

    const codesRef = db.collection("proofCodes");
    const snapshot = await codesRef.where("code", "==", userCode).where("status", "==", "valid").limit(1).get();

    if (snapshot.empty) {
      return { success: false, message: "유효하지 않거나 이미 사용된 코드입니다." };
    }

    const doc = snapshot.docs[0];
    await doc.ref.update({
      status: "used",
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      // 어떤 사용자가 코드를 사용했는지 기록 (선택사항)
      usedBy: context.auth.uid,
    });

    return { success: true, message: "숙제 완료가 성공적으로 확인되었습니다!" };
  });
