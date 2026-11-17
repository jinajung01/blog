// 메인 화면: 카테고리 필터 + 글 검색
(function () {
  var cards = Array.prototype.slice.call(document.querySelectorAll('.cards .card'));
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var input = document.getElementById('search');
  var empty = document.getElementById('empty');
  if (!cards.length || !input) return;

  var currentCat = 'all';

  function apply() {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var catOk = currentCat === 'all' || card.dataset.cat === currentCat;
      var textOk = !q || card.textContent.toLowerCase().indexOf(q) !== -1;
      var show = catOk && textOk;
      card.hidden = !show;
      if (show) shown++;
    });
    empty.classList.toggle('show', shown === 0);
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      currentCat = chip.dataset.cat;
      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
      });
      apply();
    });
  });

  // 메인 화면에서는 검색창에 입력하는 즉시 걸러냄 (페이지 이동 없이)
  input.addEventListener('input', apply);
  input.form.addEventListener('submit', function (e) {
    e.preventDefault();
    apply();
    document.getElementById('posts').scrollIntoView({ behavior: 'smooth' });
  });

  // 다른 페이지에서 검색하고 넘어온 경우 (?q=검색어)
  var q = new URLSearchParams(location.search).get('q');
  if (q) {
    input.value = q;
    apply();
    document.getElementById('posts').scrollIntoView();
  }
})();
