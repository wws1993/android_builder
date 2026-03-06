window.onload = () => {
  const header = document.querySelector('.header');
  header.addEventListener('click', () => {
    alert('Hello World');
  });

  console.log(123, header);
}