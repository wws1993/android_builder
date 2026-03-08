window.onload = function() {
  console.log('test1');

  var p = document.querySelector('.p2');
  console.log(p);

  p.addEventListener('click', () => {
    p.innerHTML = '123123'
  })
}