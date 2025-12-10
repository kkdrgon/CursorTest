const primes = [29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83];
const publicEOptions = [3, 5, 17, 257];

const primePSelect = document.getElementById("primeP");
const primeQSelect = document.getElementById("primeQ");
const publicESelect = document.getElementById("publicE");
const refreshBtn = document.getElementById("refreshKeys");
const encryptBtn = document.getElementById("encryptBtn");
const decryptBtn = document.getElementById("decryptBtn");
const clearBtn = document.getElementById("clearBtn");

const primeResults = document.getElementById("primeResults");
const keyResults = document.getElementById("keyResults");
const summaryResults = document.getElementById("summaryResults");

const plainText = document.getElementById("plainText");
const cipherText = document.getElementById("cipherText");

let currentKeys = {
  p: primes[0],
  q: primes[1],
  n: 0,
  phi: 0,
  e: publicEOptions[0],
  d: 0,
};

function populateSelect(select, values) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function gcd(a, b) {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return Math.abs(a);
}

function egcd(a, b) {
  if (b === 0) {
    return { g: a, x: 1, y: 0 };
  }
  const { g, x, y } = egcd(b, a % b);
  return { g, x: y, y: x - Math.floor(a / b) * y };
}

function modInverse(e, phi) {
  const { g, x } = egcd(e, phi);
  if (g !== 1) return null;
  return ((x % phi) + phi) % phi;
}

function modPow(base, exponent, modulus) {
  if (modulus === 1) return 0;
  let result = 1;
  let b = base % modulus;
  let e = exponent;
  while (e > 0) {
    if (e % 2 === 1) {
      result = (result * b) % modulus;
    }
    b = (b * b) % modulus;
    e = Math.floor(e / 2);
  }
  return result;
}

function updatePrimeResults() {
  const { p, q, n, phi } = currentKeys;
  primeResults.innerHTML = `
    <p>当前选择：<strong>p = ${p}</strong>，<strong>q = ${q}</strong></p>
    <p>n = p × q = <strong>${n}</strong></p>
    <p>φ(n) = (p - 1)(q - 1) = <strong>${phi}</strong></p>
  `;
}

function updateKeyResults() {
  const { e, phi } = currentKeys;
  const status =
    gcd(e, phi) === 1
      ? `<span class="status-ok">e 与 φ(n) 互质，可以使用！</span>`
      : `<span class="status-warn">需要重新选择 e。</span>`;
  keyResults.innerHTML = `
    <p>公开指数 e = <strong>${e}</strong></p>
    <p>${status}</p>
  `;
}

function updateSummary() {
  const { n, phi, e, d } = currentKeys;
  const ready = n > 0 && d;
  summaryResults.innerHTML = ready
    ? `
      <p>公钥 (n, e) = (<strong>${n}</strong>, <strong>${e}</strong>)</p>
      <p>私钥 d = <strong>${d}</strong></p>
      <p class="status-ok">现在可以进行加密和解密啦！</p>
    `
    : `<p class="status-warn">请选择有效的素数与 e 值。</p>`;
}

function refreshKeyData() {
  const p = Number(primePSelect.value);
  const q = Number(primeQSelect.value);
  if (p === q) {
    summaryResults.innerHTML =
      '<p class="status-warn">p 和 q 必须不同，请重新选择。</p>';
    return;
  }
  const n = p * q;
  const phi = (p - 1) * (q - 1);
  const e = Number(publicESelect.value);
  const d = modInverse(e, phi);
  if (!d) {
    summaryResults.innerHTML =
      '<p class="status-warn">无法找到私钥 d，请重新选择素数或 e。</p>';
    return;
  }
  currentKeys = { p, q, n, phi, e, d };
  updatePrimeResults();
  updateKeyResults();
  updateSummary();
}

function encrypt() {
  if (!currentKeys.d) {
    alert("请先选择有效的密钥组合。");
    return;
  }
  const message = plainText.value;
  if (!message) {
    alert("请输入要加密的内容。");
    return;
  }
  const { e, n } = currentKeys;
  const cipherValues = Array.from(message).map((char) =>
    modPow(char.charCodeAt(0), e, n)
  );
  cipherText.value = cipherValues.join(" ");
}

function decrypt() {
  if (!currentKeys.d) {
    alert("请先选择有效的密钥组合。");
    return;
  }
  const cipherValues = cipherText.value
    .trim()
    .split(/\s+/)
    .map((val) => Number(val))
    .filter((val) => !Number.isNaN(val));
  if (cipherValues.length === 0) {
    alert("请输入要解密的数字。");
    return;
  }
  const { d, n } = currentKeys;
  const message = cipherValues
    .map((val) => String.fromCharCode(modPow(val, d, n)))
    .join("");
  plainText.value = message;
}

function clearFields() {
  plainText.value = "";
  cipherText.value = "";
}

function init() {
  populateSelect(primePSelect, primes);
  populateSelect(primeQSelect, primes.slice().reverse());
  populateSelect(publicESelect, publicEOptions);
  primePSelect.value = currentKeys.p;
  primeQSelect.value = currentKeys.q;
  publicESelect.value = currentKeys.e;
  refreshKeyData();
}

refreshBtn.addEventListener("click", refreshKeyData);
primePSelect.addEventListener("change", refreshKeyData);
primeQSelect.addEventListener("change", refreshKeyData);
publicESelect.addEventListener("change", refreshKeyData);
encryptBtn.addEventListener("click", encrypt);
decryptBtn.addEventListener("click", decrypt);
clearBtn.addEventListener("click", clearFields);

init();

