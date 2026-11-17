// Firebase 설정 — Firebase 콘솔의 [프로젝트 설정 → 내 앱]에 있는 값을 붙여 넣습니다.
// 이 값들은 공개되어도 괜찮도록 만들어진 값입니다. 실제 보호는 firestore.rules가 맡습니다.
// 비워 두면 로그인·글쓰기 없이 예시 글만 보이는 블로그로 동작합니다.
export const firebaseConfig = {
  apiKey: 'AIzaSyC7tTJAyB8Wwqufk2yNfI-OeabtIoUdm0g',
  authDomain: 'my-blog-84ab8.firebaseapp.com',
  projectId: 'my-blog-84ab8',
  storageBucket: 'my-blog-84ab8.firebasestorage.app',
  messagingSenderId: '881829861855',
  appId: '1:881829861855:web:88dc0b35e56035a11bcc6a'
};

// 관리자 구글 계정의 사용자 ID(UID) 1개 — 처음 로그인하면 로그인 화면에 표시됩니다.
// firestore.rules 안의 같은 값도 함께 바꿔야 합니다.
export const ADMIN_UID = '5O7QPzPsnLUSRNf9fefKpNEYayW2';
