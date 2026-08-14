# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


## Firebase 登入設定

此版本保留 Google 登入，並新增「工號 + 密碼」登入。

工號登入會把 `D7445` 轉成：
`d7445@<VITE_FIREBASE_LOGIN_DOMAIN>`

登入成功後讀取：
`shiftUsers/D7445`

並使用 `employeeId`、`name`、`shift` 顯示首頁資料。

請將 `.env.example` 複製成 `.env.local`，填入 Firebase Console 的 Web App 設定，以及你已建立的 Firebase Email/Password 帳號所使用的 Email 網域。

注意：不要把 Firebase Admin SDK 私密金鑰放進前端。
