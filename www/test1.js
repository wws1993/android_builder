window.onload = () => {
  var p = document.querySelector('.p2')
  p.addEventListener('click', () => {
    p.nodeValue = '123123'
  })
}